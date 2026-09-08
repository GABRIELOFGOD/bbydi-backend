import nodemailer from "nodemailer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { magicLinkEmail } from "../templates/email";

config()

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const magicMailer = async (email: string, magicLink: string) => {
  try {
    const template = magicLinkEmail(magicLink);

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: "Your Magic Link",
      html: template
    };
    const report = await transporter.sendMail(mailOptions);
    console.log("Mailer report", report.messageId);
  } catch (error) {
    throw error;
  }
};