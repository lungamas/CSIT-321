/**
 * Email Service Module
 * Handles sending emails for password resets and notifications
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

// Create email transporter
const createTransporter = () => {
  // Check if email is configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('⚠️  Email not configured. Using console logging for development.');
    return null;
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (toEmail, resetLink, userName) => {
  const transporter = createTransporter();
  
  // If no transporter (email not configured), just log
  if (!transporter) {
    console.log('\n=== PASSWORD RESET EMAIL ===');
    console.log('To:', toEmail);
    console.log('User:', userName || 'N/A');
    console.log('Reset Link:', resetLink);
    console.log('Token expires in 1 hour');
    console.log('===========================\n');
    return { success: true, method: 'console' };
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'iMark - Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background: white;
              border-radius: 10px;
              padding: 40px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 32px;
              font-weight: bold;
              color: #16A348;
              margin-bottom: 10px;
            }
            .content {
              margin-bottom: 30px;
            }
            .button {
              display: inline-block;
              background: #16A348;
              color: white !important;
              padding: 15px 40px;
              text-decoration: none;
              border-radius: 50px;
              font-weight: bold;
              margin: 20px 0;
            }
            .button:hover {
              background: #138C3D;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 12px;
              color: #666;
            }
            .link-box {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 5px;
              word-break: break-all;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">iMark</div>
              <h2 style="color: #333; margin: 0;">Password Reset Request</h2>
            </div>
            
            <div class="content">
              <p>Hello ${userName ? userName : ''},</p>
              
              <p>We received a request to reset your password for your iMark account. Click the button below to create a new password:</p>
              
              <div style="text-align: center;">
                <a href="${resetLink}" class="button">Reset Password</a>
              </div>
              
              <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
              <div class="link-box">
                <a href="${resetLink}" style="color: #16A348; word-break: break-all;">${resetLink}</a>
              </div>
              
              <div class="warning">
                <strong>⏰ Important:</strong> This link will expire in 1 hour for security reasons.
              </div>
              
              <p style="font-size: 14px; color: #666;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
            </div>
            
            <div class="footer">
              <p>This is an automated email from iMark Marketing Analytics Platform.</p>
              <p style="margin-top: 10px;">© ${new Date().getFullYear()} iMark. All rights reserved.</p>
              <p style="margin-top: 5px; font-size: 11px;">Powered by NULL SPACE</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      iMark - Password Reset Request
      
      Hello ${userName ? userName : ''},
      
      We received a request to reset your password for your iMark account.
      
      Click the link below to reset your password:
      ${resetLink}
      
      This link will expire in 1 hour for security reasons.
      
      If you didn't request this password reset, you can safely ignore this email.
      
      © ${new Date().getFullYear()} iMark. All rights reserved.
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✉️  Password reset email sent:', info.messageId);
    return { success: true, method: 'email', messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    // Fallback to console logging
    console.log('\n=== PASSWORD RESET EMAIL (Fallback) ===');
    console.log('To:', toEmail);
    console.log('Reset Link:', resetLink);
    console.log('=======================================\n');
    return { success: false, error: error.message, method: 'console-fallback' };
  }
};

module.exports = {
  sendPasswordResetEmail
};
