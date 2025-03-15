const PDFDocument = require('pdfkit');
const fs = require('fs');

const generateCertificate = async (student) => {
  const doc = new PDFDocument();
  const filePath = `./certificates/${student.studentId}_clearance.pdf`;

  doc.pipe(fs.createWriteStream(filePath));
  doc.fontSize(25).text('Clearance Certificate', { align: 'center' });
  doc.moveDown();
  doc.fontSize(16).text(`Name: ${student.name}`, { align: 'center' });
  doc.text(`Student ID: ${student.studentId}`, { align: 'center' });
  doc.moveDown();
  doc.text('All departments cleared successfully!', { align: 'center' });
  doc.end();

  return filePath;
};

module.exports = { generateCertificate };