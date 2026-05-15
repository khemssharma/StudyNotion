import "./App.css";
import {Route, Routes } from "react-router-dom";
import Home from "./pages/Home"
import Navbar from "./components/common/Navbar"
import OpenRoute from "./components/core/Auth/OpenRoute"

import Login from "./pages/Login"
import Signup from "./pages/Signup"
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from "./pages/UpdatePassword";
import VerifyEmail from "./pages/VerifyEmail";
import About from "./pages/About";
import Contact from "./pages/Contact";
import MyProfile from "./components/core/Dashboard/MyProfile";
import Dashboard from "./pages/Dashboard";
import PrivateRoute from "./components/core/Auth/PrivateRoute";
import Error from "./pages/Error"
import Search from "./pages/Search";
import InstructorDetails from "./pages/InstructorDetails";
import Settings from "./components/core/Dashboard/Settings";
import { useSelector } from "react-redux";
import EnrolledCourses from "./components/core/Dashboard/EnrolledCourses";
import Cart from "./components/core/Dashboard/Cart";
import { ACCOUNT_TYPE } from "./utils/constants";
import AddCourse from "./components/core/Dashboard/AddCourse";
import MyCourses from "./components/core/Dashboard/MyCourses";
import EditCourse from "./components/core/Dashboard/EditCourse";
import Catalog from "./pages/Catalog";
import CourseDetails from "./pages/CourseDetails";
import ViewCourse from "./pages/ViewCourse";
import VideoDetails from "./components/core/ViewCourse/VideoDetails";
import Discover from "./pages/Discover";
import Instructor from "./components/core/Dashboard/InstructorDashboard/Instructor";
import AdminDashboard from "./components/core/Dashboard/AdminDashboard/AdminDashboard";
import MLInsights from "./components/core/Dashboard/AdminDashboard/MLInsights";
import MLTraining from "./components/core/Dashboard/AdminDashboard/MLTraining";
import MLRecommendations from "./components/core/Dashboard/AdminDashboard/MLRecommendations";

function App() {
  const { user } = useSelector((state) => state.profile)
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="search" element={<Search />} />
        <Route path="error" element={<Error />} />
        <Route path="/catalog/:catalogName" element={<Catalog />} />
        <Route path="/courses/:courseId" element={<CourseDetails />} />
        <Route path="/instructor/:instructorId" element={<InstructorDetails />} />
        <Route path="/discover" element={<Discover />} />

        <Route path="login" element={<OpenRoute><Login /></OpenRoute>} />
        <Route path="signup" element={<OpenRoute><Signup /></OpenRoute>} />
        <Route path="forgot-password" element={<OpenRoute><ForgotPassword /></OpenRoute>} />
        <Route path="update-password/:id" element={<OpenRoute><UpdatePassword /></OpenRoute>} />
        <Route path="verify-email" element={<OpenRoute><VerifyEmail /></OpenRoute>} />

        <Route element={<PrivateRoute><Dashboard /></PrivateRoute>} path="/dashboard">
          <Route path="my-profile" element={<MyProfile />} />
          <Route path="settings" element={<Settings />} />

          {user?.accountType === ACCOUNT_TYPE.STUDENT && (
            <>
              <Route path="enrolled-courses" element={<EnrolledCourses />} />
              <Route path="cart" element={<Cart />} />
            </>
          )}

          {user?.accountType === ACCOUNT_TYPE.INSTRUCTOR && (
            <>
              <Route path="instructor" element={<Instructor />} />
              <Route path="my-courses" element={<MyCourses />} />
              <Route path="add-course" element={<AddCourse />} />
              <Route path="edit-course/:courseId" element={<EditCourse />} />
            </>
          )}

          {user?.accountType === ACCOUNT_TYPE.ADMIN && (
            <>
              <Route path="admin" element={<AdminDashboard />} />
              <Route path="admin/ml-insights" element={<MLInsights />} />
              <Route path="admin/ml-training" element={<MLTraining />} />
              <Route path="admin/recommendations" element={<MLRecommendations />} />
            </>
          )}
        </Route>

        <Route element={<PrivateRoute><ViewCourse /></PrivateRoute>} path="/view-course/:courseId">
          {user?.accountType === ACCOUNT_TYPE.STUDENT && (
            <>
              <Route path="section/:sectionId/sub-section/:subSectionId" element={<VideoDetails />} />
            </>
          )}
        </Route>

      </Routes>
    </>
  );
}

export default App;
