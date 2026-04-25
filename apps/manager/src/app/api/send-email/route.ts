import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { to, subject, html, attachments } = body;

        if (!to || !subject || !html) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Check for required environment variables
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            return NextResponse.json(
                {
                    error: 'SMTP Configuration Missing',
                    details: 'SMTP_USER and SMTP_PASS environment variables must be set in .env.local'
                },
                { status: 500 }
            );
        }

        // SMTP Transporter configuration
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        // Verify connection configuration
        // await transporter.verify();

        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER, // sender address
            to: to, // list of receivers
            subject: subject, // Subject line
            html: html, // html body
            attachments: attachments, // attachments array
        };

        const info = await transporter.sendMail(mailOptions);

        console.log('Message sent: %s', info.messageId);

        return NextResponse.json({ success: true, messageId: info.messageId });
    } catch (error: any) {
        console.error('Error sending email:', error);
        return NextResponse.json(
            { error: 'Failed to send email', details: error.message },
            { status: 500 }
        );
    }
}
