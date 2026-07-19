const nodemailer = require('nodemailer');
require('dotenv').config();

const hasSmtpConfig = 
  process.env.SMTP_HOST && 
  process.env.SMTP_USER && 
  process.env.SMTP_PASS;

let transporter = null;
let isMock = false;

if (hasSmtpConfig) {
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    console.log('✔ Successfully configured SMTP NodeMailer transporter');
  } catch (error) {
    console.error('❌ Failed to configure SMTP transporter. Running in MOCK mail mode:', error.message);
    isMock = true;
  }
} else {
  console.warn('⚠️ SMTP mail credentials missing in .env. Email Service is running in MOCK Mode.');
  isMock = true;
}

/**
 * Sends a premium verification email containing a 6-digit OTP code.
 * @param {string} toEmail 
 * @param {string} code 
 * @returns {Promise<boolean>}
 */
async function sendVerificationEmail(toEmail, code) {
  if (isMock) {
    console.log('\n==================================================');
    console.log('📬 [MOCK EMAIL SERVICE]');
    console.log(`To:      ${toEmail}`);
    console.log(`Subject: [EZ Studio] Xác minh đăng ký tài khoản`);
    console.log(`Mã OTP:  ${code} (Hết hạn sau 5 phút)`);
    console.log('==================================================\n');
    return true;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || '"EZ Studio" <noreply@ezstudio.com>',
    to: toEmail,
    subject: '[EZ Studio] Mã xác minh đăng ký tài khoản (OTP)',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1117; color: #c9d1d9; padding: 40px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #21262d;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #ffc900; margin: 0; font-size: 28px; letter-spacing: 1px;">EZ Studio</h2>
          <p style="color: #8b949e; font-size: 14px; margin-top: 5px;">Minecraft Resources & Server Setups</p>
        </div>
        
        <div style="background-color: #161b22; padding: 25px; border-radius: 8px; border: 1px solid #30363d; text-align: center;">
          <h3 style="color: #ffffff; margin-top: 0;">Mã xác minh của bạn</h3>
          <p style="color: #8b949e; font-size: 15px; margin-bottom: 20px;">Vui lòng nhập mã OTP dưới đây để hoàn tất việc đăng ký tài khoản trên hệ thống.</p>
          
          <div style="background: linear-gradient(135deg, #9a5bed, #76c83f); color: #ffffff; font-size: 32px; font-weight: bold; padding: 15px 30px; letter-spacing: 5px; display: inline-block; border-radius: 6px; box-shadow: 0 4px 15px rgba(154, 91, 237, 0.3); margin-bottom: 20px;">
            ${code}
          </div>
          
          <p style="color: #ff7b72; font-size: 13px; margin: 0;">* Mã OTP này có thời hạn sử dụng là <b>5 phút</b>.</p>
        </div>
        
        <div style="margin-top: 30px; font-size: 12px; color: #8b949e; text-align: center; border-top: 1px solid #21262d; padding-top: 20px;">
          <p>Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua email này.</p>
          <p>&copy; 2026 EZ Studio. All rights reserved.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✔ Verification email sent to ${toEmail}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${toEmail} using SMTP:`, error.message);
    console.warn(`⚠️ Automatically falling back to Console OTP logging to prevent system blockage.`);
    console.log('\n==================================================');
    console.log('📬 [FALLBACK MOCK EMAIL SERVICE]');
    console.log(`To:      ${toEmail}`);
    console.log(`Subject: [EZ Studio] Xác minh đăng ký tài khoản`);
    console.log(`Mã OTP:  ${code} (Hết hạn sau 5 phút)`);
    console.log('==================================================\n');
    return true;
  }
}

/**
 * Sends a premium password reset email containing a reset link.
 * @param {string} toEmail 
 * @param {string} resetUrl 
 * @returns {Promise<boolean>}
 */
async function sendResetPasswordEmail(toEmail, resetUrl) {
  if (isMock) {
    console.log('\n==================================================');
    console.log('📬 [MOCK EMAIL SERVICE]');
    console.log(`To:      ${toEmail}`);
    console.log(`Subject: [EZ Studio] Khôi phục mật khẩu`);
    console.log(`Liên kết khôi phục: ${resetUrl} (Hết hạn sau 15 phút)`);
    console.log('==================================================\n');
    return true;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || '"EZ Studio" <noreply@ezstudio.com>',
    to: toEmail,
    subject: '[EZ Studio] Yêu cầu khôi phục mật khẩu tài khoản',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1117; color: #c9d1d9; padding: 40px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #21262d;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #ffc900; margin: 0; font-size: 28px; letter-spacing: 1px;">EZ Studio</h2>
          <p style="color: #8b949e; font-size: 14px; margin-top: 5px;">Minecraft Resources & Server Setups</p>
        </div>
        
        <div style="background-color: #161b22; padding: 25px; border-radius: 8px; border: 1px solid #30363d; text-align: center;">
          <h3 style="color: #ffffff; margin-top: 0;">Khôi phục mật khẩu của bạn</h3>
          <p style="color: #8b949e; font-size: 15px; margin-bottom: 25px;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với địa chỉ email này. Vui lòng bấm vào nút bên dưới để tiến hành khôi phục mật khẩu.</p>
          
          <div style="margin-bottom: 25px;">
            <a href="${resetUrl}" target="_blank" style="background: linear-gradient(135deg, #9a5bed, #76c83f); color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 12px 30px; display: inline-block; border-radius: 6px; box-shadow: 0 4px 15px rgba(154, 91, 237, 0.3);">
              Đặt lại mật khẩu
            </a>
          </div>
          
          <p style="color: #8b949e; font-size: 13px; margin-bottom: 10px;">Hoặc bạn có thể sao chép liên kết dưới đây vào trình duyệt:</p>
          <p style="color: #58a6ff; font-size: 13px; word-break: break-all; margin: 0;">${resetUrl}</p>
          
          <p style="color: #ff7b72; font-size: 13px; margin-top: 20px; margin-bottom: 0;">* Liên kết này sẽ hết hạn sau <b>15 phút</b>.</p>
        </div>
        
        <div style="margin-top: 30px; font-size: 12px; color: #8b949e; text-align: center; border-top: 1px solid #21262d; padding-top: 20px;">
          <p>Nếu bạn không gửi yêu cầu này, vui lòng bảo mật tài khoản và bỏ qua email này.</p>
          <p>&copy; 2026 EZ Studio. All rights reserved.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✔ Reset password email sent to ${toEmail}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send reset password email to ${toEmail} using SMTP:`, error.message);
    console.warn(`⚠️ Automatically falling back to Console reset link logging to prevent system blockage.`);
    console.log('\n==================================================');
    console.log('📬 [FALLBACK MOCK EMAIL SERVICE]');
    console.log(`To:      ${toEmail}`);
    console.log(`Subject: [EZ Studio] Khôi phục mật khẩu`);
    console.log(`Liên kết khôi phục: ${resetUrl} (Hết hạn sau 15 phút)`);
    console.log('==================================================\n');
    return true;
  }
}

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  isMock
};

