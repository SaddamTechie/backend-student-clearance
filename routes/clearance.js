const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Report = require('../models/Report');
const Request = require('../models/Request');
const qrcode = require('qrcode');
const { sendEmail } = require('../utils/notifications');
const { generateCertificate } = require('../utils/pdfGenerator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();
const secret = process.env.SECRET_KEY || 'your-default-secret-key';

// Middleware to verify token and role
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // { id, role, department (if staff) }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Role-based middleware
const roleMiddleware = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
  }
  next();
};

// Unified Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  try {
    let user = await Student.findOne({ email });
    let role = 'student';
    if (!user) {
      user = await Staff.findOne({ email });
      role = user ? user.role : null;
    }
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: role === 'student' ? user.studentId : user._id, role, department: user.department || null },
      secret,
      { expiresIn: '1h' }
    );
    res.json({ token, role, id: role === 'student' ? user.studentId : user._id });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Register Student
router.post('/register', async (req, res) => {
  const { studentId, name, email, password } = req.body;
  if (!studentId || !name || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existingStudent = await Student.findOne({ studentId });
    if (existingStudent) return res.status(400).json({ message: 'Student already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const student = new Student({ studentId, name, email, password: hashedPassword });
    await student.save();
    res.status(201).json({ message: 'Student registered', student });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Register Staff (Admin Only)
router.post('/staff/register', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  const { email, department } = req.body;
  if (!email || !department) return res.status(400).json({ message: 'Email and department are required' });

  try {
    const existingStaff = await Staff.findOne({ email });
    if (existingStaff) return res.status(400).json({ message: 'Staff already exists' });

    const defaultPassword = Math.random().toString(36).slice(-8); // Random 8-char password
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const staff = new Staff({ email, password: hashedPassword, department, role: 'staff' });
    await staff.save();

    // Send email with default password (configure sendEmail later)
    //sendEmail(email, 'Your Staff Account', `Your login credentials: Email: ${email}, Password: ${defaultPassword}`);
    console.log(email, 'Your Staff Account', `Your login credentials: Email: ${email}, Password: ${defaultPassword}`)
    res.status(201).json({ message: 'Staff registered', staff });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update Staff Password
router.put('/staff/password', authMiddleware, roleMiddleware(['staff', 'admin']), async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ message: 'Old and new passwords are required' });

  try {
    const staff = await Staff.findById(req.user.id);
    const isMatch = await bcrypt.compare(oldPassword, staff.password);
    if (!isMatch) return res.status(401).json({ message: 'Incorrect old password' });

    staff.password = await bcrypt.hash(newPassword, 10);
    await staff.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Submit Clearance Request (Student Only)
router.post('/request', authMiddleware, roleMiddleware(['student']), async (req, res) => {
  const { department } = req.body;
  const studentId = req.user.id;
  if (!department) return res.status(400).json({ message: 'Department is required' });

  try {
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const request = new Request({ studentId, department });
    await request.save();
    res.status(201).json({ message: 'Request submitted', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Approve/Reject Request (Staff Only, Department-Specific)
router.put('/approve/:requestId', authMiddleware, roleMiddleware(['staff', 'admin']), async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be "approved" or "rejected"' });
  }

  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (req.user.role === 'staff' && req.user.department !== request.department) {
      return res.status(403).json({ message: 'You can only approve requests for your department' });
    }

    request.status = status;
    await request.save();

    const student = await Student.findOne({ studentId: request.studentId });
    student.clearanceStatus[request.department] = status;
    await student.save();

    const allCleared = Object.values(student.clearanceStatus).every((s) => s === 'approved');
    if (allCleared) {
      student.certificateGenerated = true;
      await student.save();
      const pdfPath = await generateCertificate(student);
      // sendEmail(student.email, 'Clearance Certificate', 'Attached is your clearance certificate.', pdfPath);
    }

    res.json({ message: `Request ${status}`, student });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get QR Code (Student Only)
router.get('/qr', authMiddleware, roleMiddleware(['student']), async (req, res) => {
  const studentId = req.user.id;
  try {
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const qrData = JSON.stringify({ studentId, timestamp: Date.now() });
    //const qrCode = await qrcode.toDataURL(qrData);
    res.json({ qrCode: qrData });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// Get Clearance Status (Student Only)
router.get('/status', authMiddleware, roleMiddleware(['student']), async (req, res) => {
  const studentId = req.user.id;
  try {
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const requests = await Request.find({ studentId });
    const departments = ['finance', 'library', 'department', 'hostel', 'administration'];
    const status = {};
    const requestsSent = {};

    departments.forEach((department) => {
      status[department] = student.clearanceStatus[department] || 'pending';
      requestsSent[department] = false;
    });

    requests.forEach((request) => {
      status[request.department] = request.status;
      requestsSent[request.department] = true;
    });

    res.json({ status, requestsSent, email: student.email ,studentId: studentId});
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get Requests (Staff Only, Department-Specific)
router.get('/requests', authMiddleware, roleMiddleware(['staff', 'admin']), async (req, res) => {
  try {
    const query = req.user.role === 'staff' ? { department: req.user.department } : {};
    const requests = await Request.find(query);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// Post Report 
router.post('/report', authMiddleware, async (req, res) => {
  const { department, message } = req.body;
  const studentId = req.user.id;

  if (!department || !message) {
    return res.status(400).json({ message: 'Department and message are required' });
  }

  try {
    const report = new Report({
      studentId,
      department,
      message,
    });
    await report.save();
    console.log(`Report from student ${studentId} to ${department}: ${message}`);
    res.status(201).json({ message: 'Report submitted successfully' });
  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({ message: 'Failed to submit report' });
  }
});



router.get('/reports', authMiddleware, async (req, res) => {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  const department = req.user.department; // From token
  try {
    const reports = await Report.find({ department }).sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Failed to fetch reports' });
  }
});


router.patch('/report/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  const { id } = req.params;
  const { status } = req.body;
  const staffDepartment = req.user.department;

  if (!['pending', 'resolved'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    if (report.department !== staffDepartment) {
      return res.status(403).json({ message: 'You can only update reports in your department' });
    }
    report.status = status;
    await report.save();
    res.json(report);
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ message: 'Failed to update report' });
  }
});


router.post('/verify', authMiddleware, async (req, res) => {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  const { id } = req.body; // Scanned student ID from QR
  if (!id) {
    return res.status(400).json({ message: 'Student ID required' });
  }

  try {
    const clearance = await Request.findOne({ studentId: id });
    if (!clearance) {
      console.log('Student Req not found');
      return res.status(404).json({ message: 'Student not found' });
    }
    const student = await Student.findOne({ studentId: id });
    if (!student) {
      console.log('Student not found');
      return res.status(404).json({ message: 'Student not found' });
    }
    // Return clearance status for the staff's department
    const departmentStatus = student.clearanceStatus.get(req.user.department) || 'pending';
    res.json({
      studentId: id,
      email: student.email,
      department: req.user.department,
      status: departmentStatus,
    });
  } catch (error) {
    console.error('Error verifying student:', error);
    res.status(500).json({ message: 'Failed to verify student' });
  }
});



module.exports = router;