import { useGoogleLogin } from '@react-oauth/google';
import { FcGoogle } from 'react-icons/fc';
import { useSelector } from 'react-redux';
import frameImg from '../../../assets/Images/frame.png';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import { googleOauth } from "../../../services/operations/authAPI"
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';

function Template({ title, description1, description2, image, formType }) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { loading } = useSelector((state) => state.auth);

  const handleGoogleSignIn = useGoogleLogin({
    onSuccess: (response) => { 
      console.log('Google login successful, token: ', response);
      dispatch(googleOauth(response, navigate));
    },
    onError: () => {
      console.error('Google login failed');
    },
  });

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center">
      {loading ? (
        <div className="spinner"></div>
      ) : (
        <div className="mx-auto flex w-11/12 max-w-maxContent flex-col-reverse justify-between gap-y-12 py-12 md:flex-row md:gap-y-0 md:gap-x-12">
          <div className="mx-auto w-11/12 max-w-[450px] md:mx-0">
            <h1 className="text-[1.875rem] font-semibold leading-[2.375rem] text-richblack-5">
              {title}
            </h1>
            <p className="mt-4 text-[1.125rem] leading-[1.625rem]">
              <span className="text-richblack-100">{description1}</span>{' '}
              <span className="font-edu-sa font-bold italic text-blue-100">
                {description2}
              </span>
            </p>

            {/* Continue with Google Button */}
            <button
              onClick={() => handleGoogleSignIn()}
              className="flex items-center justify-center w-full mt-4 mb-4 py-2 bg-white border border-gray-300 rounded-lg text-black shadow-md hover:bg-gray-100"
            >
              <FcGoogle className="mr-2" /> Continue with Google
            </button>

            {formType === 'signup' ? <SignupForm /> : <LoginForm />}
          </div>
          <div className="relative mx-auto w-11/12 max-w-[450px] md:mx-0">
            <img
              src={frameImg}
              alt="Pattern"
              width={558}
              height={504}
              loading="lazy"
            />
            <img
              src={image}
              alt="Students"
              width={558}
              height={504}
              loading="lazy"
              className="absolute -top-4 right-4 z-10"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Template;
