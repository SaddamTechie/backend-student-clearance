const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  department: { type: String, required: true, enum: ['finance', 'library', 'department', 'hostel', 'administration'] },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Request', requestSchema);