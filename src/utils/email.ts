import nodemailer from 'nodemailer';

interface OptionsParams {
  email: string;
  subject: string;
  text?: string;
  html?: string;
}

interface mailOptions {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const sendEmail = async (options: OptionsParams) => {
  const transporter = nodemailer.createTransport({
    // service: 'Gmail',
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
  const mailOptions: mailOptions = {
    from: 'test@mail.com',
    to: options.email,
    subject: options.subject,
  };

  if (options.text) {
    mailOptions.text = options.text;
  }

  if (options.html) {
    mailOptions.html = options.html;
  }

  const mailRes = await transporter.sendMail(mailOptions);

  const result = mailRes.response.includes('Ok') ? 'success' : 'fail';

  return result;
};
