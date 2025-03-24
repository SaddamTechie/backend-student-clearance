const mongoose = require('mongoose');


const ReportSchema = new mongoose.Schema({
    studentId: { type: String, required: true }, // From token
    department: { type: String, required: true }, // Target department
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    status: { type: String, default: 'pending', enum: ['pending', 'resolved'] },
  });

  module.exports = mongoose.model('Report', ReportSchema);