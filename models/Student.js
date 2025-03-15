const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  clearanceStatus: {
    finance: { type: String, default: 'pending' },
    library: { type: String, default: 'pending' },
    department: { type: String, default: 'pending' },
    hostel: { type: String, default: 'pending' },
    administration: { type: String, default: 'pending' },
  },
  certificateGenerated: { type: Boolean, default: false },
});

module.exports = mongoose.model('Student', studentSchema);