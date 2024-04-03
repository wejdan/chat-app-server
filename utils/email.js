const nodemailer = require("nodemailer");

// Create a transporter object using the default SMTP transport
let transporter = nodemailer.createTransport({
  service: "gmail", // Use Gmail's service
  auth: {
    user: process.env.MAIL_USER, // Your Gmail address
    pass: process.env.MAIL_PASS, // Your Gmail password or App Password if 2FA is enabled
  },
});

/**
 * Sends an OTP to the given email.
 * @param {string} email The email address to send the OTP to.
 * @param {string} otp The OTP to send.
 */
const sendOtpEmail = async (email, otp) => {
  try {
    let mailOptions = {
      from: '"Your App Name" <pro.notifier.services@gmail.com>', // sender address
      to: email, // list of receivers
      subject: "Your OTP", // Subject line
      text: `Your OTP is: ${otp}`, // plain text body
      html: `<b>Your OTP is: ${otp}</b>`, // html body
    };

    // send mail with defined transport object
    let info = await transporter.sendMail(mailOptions);
    console.log("Message sent: %s", email);
  } catch (error) {
    console.error("Error sending OTP email:", error);
  }
};
const sendRestEmail = async (email, resetToken) => {
  const resetURL = `http://localhost:3000/reset/${resetToken}`;

  let mailOptions = {
    to: email,
    from: "pro.notifier.services@gmail.com",
    subject: "Password Reset",
    text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
               Please click on the following link, or paste this into your browser to complete the process:\n\n
               ${resetURL} \n\n
               If you did not request this, please ignore this email and your password will remain unchanged.\n`,
  };

  await transporter.sendMail(mailOptions);
};
module.exports = { sendOtpEmail, sendRestEmail };
