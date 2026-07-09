const nodemailer = require("nodemailer");

const mailSender = async (email, title, body) => {
    try{
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                port:465,
                secure:true,
                host:process.env.MAIL_HOST,
                auth:{
                    user: process.env.MAIL_USER,
                    pass: process.env.MAIL_PASS,
                },
                tls: {
                    rejectUnauthorized: false // Add this to allow self-signed certificates
                }
            })

            let info = await transporter.sendMail({
                from: 'StudyNotion || by Ayush',
                to:`${email}`,
                subject: `${title}`,
                html: `${body}`,
            })
            console.log(info);
            return info;
    }
    catch(error) {
        console.log("inside mailsender.js error: ", error.message);
    }
}


module.exports = mailSender;