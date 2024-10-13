Make sure you have the following installed on your machine:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/en)
- [npm](https://www.npmjs.com/) (Node Package Manager)

**Cloning the Repository**

```bash
git clone https://github.com/kc-sharma/StudyNotion.git
cd StudyNotion
```

**Installation**

Install the project dependencies using npm:

```bash
npm install
```

**Set Up Environment Variables**

Create a new file named `.env` in the root of your project and add the following content:

```env
REACT_APP_BASE_URL = http://localhost:4000/api/v1

REACT_APP_GOOGLE_CLIENT_ID = 

REACT_APP_RAZORPAY_KEY = 
```

Replace the placeholder values with your actual Google OAuth and Razorpay credentials. You can obtain these credentials by signing up on the [Google Cloud Console](https://cloud.google.com/) and [Razorpay](https://razorpay.com)

**Running the Project**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the project.
