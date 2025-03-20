const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Request = require('../models/Request');
const qrcode = require('qrcode');
const { sendEmail } = require('../utils/notifications');
const { generateCertificate } = require('../utils/pdfGenerator');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();
const secret = process.env.SECRET_KEY || 'your-default-secret-key'; // Fallback for safety

// Middleware to verify token
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, secret);
    req.studentId = decoded.studentId; // Attach studentId to request
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Login (email-based)
router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const student = await Student.findOne({ email });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const token = jwt.sign({ studentId: student.studentId }, secret, { expiresIn: '1h' });
    res.json({ token, studentId: student.studentId });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Register Student
router.post('/register', async (req, res) => {
  const { studentId, name, email } = req.body;
  if (!studentId || !name || !email) {
    return res.status(400).json({ message: 'Student ID, name, and email are required' });
  }

  try {
    const existingStudent = await Student.findOne({ studentId });
    if (existingStudent) return res.status(400).json({ message: 'Student already exists' });

    const student = new Student({ studentId, name, email });
    await student.save();
    res.status(201).json({ message: 'Student registered', student });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Submit Clearance Request (studentId from token)
router.post('/request', authMiddleware, async (req, res) => {
  const { department } = req.body;
  const studentId = req.studentId; // From token
  if (!department) return res.status(400).json({ message: 'Department is required' });

  try {
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const request = new Request({ studentId, department });
    await request.save();

    // Notify student (commented out for now)
    // sendEmail(student.email, `${department} Clearance Requested`, 'Your clearance request is pending approval.');
    res.status(201).json({ message: 'Request submitted', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Approve/Reject Request (admin route, no studentId needed)
router.put('/approve/:requestId', authMiddleware, async (req, res) => {
  const { status } = req.body; // 'approved' or 'rejected'
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be "approved" or "rejected"' });
  }

  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.status = status;
    await request.save();

    const student = await Student.findOne({ studentId: request.studentId });
    student.clearanceStatus[request.department] = status;
    await student.save();

    // Notify student (commented out)
    // sendEmail(student.email, `${request.department} Clearance ${status}`, `Your ${request.department} clearance has been ${status}.`);

    // Check if all cleared
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

// Get QR Code (studentId from token)
router.get('/qr', authMiddleware, async (req, res) => {
  const studentId = req.studentId; // From token
  try {
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const qrData = JSON.stringify({ studentId, timestamp: Date.now() });
    const qrCode = await qrcode.toDataURL(qrData);
    res.json({ qrCode });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get Clearance Status (studentId from token)
router.get('/status', authMiddleware, async (req, res) => {
  const studentId = req.studentId; // From token
  try {
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const requests = await Request.find({ studentId });
    const departments = ['finance', 'library', 'department', 'hostel', 'administration'];
    const status = {};
    const requestsSent = {};

    // Initialize status and requestsSent
    departments.forEach((department) => {
      status[department] = student.clearanceStatus[department] || 'pending';
      requestsSent[department] = false;
    });

    // Update based on requests
    requests.forEach((request) => {
      status[request.department] = request.status;
      requestsSent[request.department] = true;
    });

    res.json({ status, requestsSent, email: student.email }); // Include email for profile
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get Requests (for admin, optional department filter)
router.get('/requests', authMiddleware, async (req, res) => {
  const { department } = req.query;
  try {
    const query = department ? { department } : {};
    const requests = await Request.find(query);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});



module.exports = router;