import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface ProfileCardUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
}

interface ContractUser {
  full_name: string;
  email: string;
  role: string;
}

interface IPMServiceRequest {
  request_number: string;
  title: string;
  farmer_info?: unknown;
  ipm_routine_details?: unknown;
  location?: unknown;
}

async function newPage(width = 420, height = 620) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([width, height]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  return { pdfDoc, page, font, boldFont };
}

function drawKeyValue(
  page: import('pdf-lib').PDFPage,
  font: import('pdf-lib').PDFFont,
  label: string,
  value: string,
  y: number
): void {
  page.drawText(`${label}:`, { x: 40, y, size: 11, font, color: rgb(0.35, 0.35, 0.35) });
  page.drawText(value, { x: 160, y, size: 11, font, color: rgb(0, 0, 0) });
}

export async function generateProfileCard(user: ProfileCardUser, qrDataUrl: string): Promise<Buffer> {
  const { pdfDoc, page, font, boldFont } = await newPage();

  page.drawText('Dashboard Avocado — Profile Card', { x: 40, y: 570, size: 16, font: boldFont, color: rgb(0.1, 0.4, 0.1) });

  let y = 520;
  drawKeyValue(page, font, 'Name', user.full_name, y); y -= 24;
  drawKeyValue(page, font, 'Role', user.role, y); y -= 24;
  drawKeyValue(page, font, 'Email', user.email, y); y -= 24;
  drawKeyValue(page, font, 'Phone', user.phone || 'N/A', y); y -= 24;

  const pngBytes = Buffer.from(qrDataUrl.split(',')[1] || '', 'base64');
  const pngImage = await pdfDoc.embedPng(pngBytes);
  page.drawImage(pngImage, { x: 130, y: 260, width: 150, height: 150 });
  page.drawText('Scan to view profile', { x: 150, y: 245, size: 9, font, color: rgb(0.4, 0.4, 0.4) });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export async function generateContract(user: ContractUser): Promise<Buffer> {
  const { pdfDoc, page, font, boldFont } = await newPage();

  page.drawText('Dashboard Avocado — Account Agreement', { x: 40, y: 570, size: 16, font: boldFont, color: rgb(0.1, 0.4, 0.1) });

  const paragraphs = [
    `This agreement is entered into between the Avocado Society of Rwanda ("the Platform") and ${user.full_name},`,
    `registered as a ${user.role} under the account ${user.email}.`,
    '',
    'By using this platform, the account holder agrees to provide accurate information, use the',
    'platform in accordance with its terms of service, and cooperate with assigned agents and',
    'administrators in the delivery of agricultural support services.',
    '',
    'This document was generated automatically at the time of registration.',
  ];

  let y = 520;
  for (const line of paragraphs) {
    page.drawText(line, { x: 40, y, size: 11, font, color: rgb(0, 0, 0) });
    y -= 20;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export async function generateIPMForm(serviceRequest: IPMServiceRequest): Promise<Buffer> {
  const { pdfDoc, page, font, boldFont } = await newPage();

  page.drawText('IPM Routine Form', { x: 40, y: 570, size: 16, font: boldFont, color: rgb(0.1, 0.4, 0.1) });

  let y = 520;
  drawKeyValue(page, font, 'Request #', serviceRequest.request_number, y); y -= 24;
  drawKeyValue(page, font, 'Title', serviceRequest.title, y); y -= 24;

  const details = (serviceRequest.ipm_routine_details as Record<string, unknown>) || {};
  for (const [key, value] of Object.entries(details)) {
    const rendered = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    drawKeyValue(page, font, key, rendered.slice(0, 60), y);
    y -= 20;
    if (y < 40) break; // stay on a single page for this v1 form
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export async function embedSignature(pdfBytes: Buffer, signatureImageBytes: Buffer, mimetype: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];

  const image = mimetype === 'image/png'
    ? await pdfDoc.embedPng(signatureImageBytes)
    : await pdfDoc.embedJpg(signatureImageBytes);

  const { width } = lastPage.getSize();
  lastPage.drawText('Signed:', { x: 40, y: 60, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
  lastPage.drawImage(image, { x: width - 190, y: 30, width: 150, height: 60 });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export const documentService = {
  generateProfileCard,
  generateContract,
  generateIPMForm,
  embedSignature,
};

export default documentService;
