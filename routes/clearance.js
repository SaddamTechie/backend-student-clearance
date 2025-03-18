const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Request = require('../models/Request');
const qrcode = require('qrcode');
const { sendEmail } = require('../utils/notifications');
const { generateCertificate } = require('../utils/pdfGenerator');

// Register Student
router.post('/register', async (req, res) => {
  const { studentId, name, email } = req.body;
  try {
    let student = await Student.findOne({ studentId });
    if (student) return res.status(400).json({ message: 'Student already exists' });

    student = new Student({ studentId, name, email });
    await student.save();
    res.status(201).json({ message: 'Student registered', student });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Submit Clearance Request
router.post('/request', async (req, res) => {
  const { studentId, department } = req.body;
  try {
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const request = new Request({ studentId, department });
    await request.save();

    // Notify student
    sendEmail(student.email, `${department} Clearance Requested`, 'Your clearance request is pending approval.');
    res.status(201).json({ message: 'Request submitted', request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Approve/Reject Request
router.put('/approve/:requestId', async (req, res) => {
  const { status } = req.body; // 'approved' or 'rejected'
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    request.status = status;
    await request.save();

    const student = await Student.findOne({ studentId: request.studentId });
    student.clearanceStatus[request.department] = status;
    await student.save();

    // Notify student (Will Implement later - No email service provider)
    //sendEmail(student.email, `${request.department} Clearance ${status}`, `Your ${request.department} clearance has been ${status}.`);

    // Check if all cleared
    const allCleared = Object.values(student.clearanceStatus).every(s => s === 'approved');
    if (allCleared) {
      student.certificateGenerated = true;
      await student.save();
      const pdfPath = await generateCertificate(student);
      //sendEmail(student.email, 'Clearance Certificate', 'Attached is your clearance certificate.', pdfPath);
    }

    res.json({ message: `Request ${status}`, student });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get QR Code
router.get('/qr/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const qrData = JSON.stringify({ studentId: student.studentId, timestamp: Date.now() });
    const qrCode = await qrcode.toDataURL(qrData);
    res.json({ qrCode });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get Clearance Status
router.get('/status/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student.clearanceStatus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/request', async (req, res) => {
  // const { department } = req.query;
  try {
    const requests = await Request.find({ department:'finance', status: 'pending' });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;