import { ACCOUNT_TYPE } from "../utils/constants";

export const sidebarLinks = [
  {
    id: 1,
    name: "My Profile",
    path: "/dashboard/my-profile",
    icon: "VscAccount",
  },
  {
    id: 2,
    name: "Dashboard",
    path: "/dashboard/instructor",
    type: ACCOUNT_TYPE.INSTRUCTOR,
    icon: "VscDashboard",
  },
  {
    id: 3,
    name: "My Courses",
    path: "/dashboard/my-courses",
    type: ACCOUNT_TYPE.INSTRUCTOR,
    icon: "VscVm",
  },
  {
    id: 4,
    name: "Add Course",
    path: "/dashboard/add-course",
    type: ACCOUNT_TYPE.INSTRUCTOR,
    icon: "VscAdd",
  },
  {
    id: 5,
    name: "Enrolled Courses",
    path: "/dashboard/enrolled-courses",
    type: ACCOUNT_TYPE.STUDENT,
    icon: "VscMortarBoard",
  },
  {
    id: 6,
    name: "Your Cart",
    path: "/dashboard/cart",
    type: ACCOUNT_TYPE.STUDENT,
    icon: "VscHistory",
  },
  {
    id: 7,
    name: "Admin Panel",
    path: "/dashboard/admin",
    type: ACCOUNT_TYPE.ADMIN,
    icon: "VscDashboard",
  },
  {
    id: 8,
    name: "ML Insights",
    path: "/dashboard/admin/ml-insights",
    type: ACCOUNT_TYPE.ADMIN,
    icon: "VscGraph",
  },
  {
    id: 9,
    name: "ML Training",
    path: "/dashboard/admin/ml-training",
    type: ACCOUNT_TYPE.ADMIN,
    icon: "VscBeaker",
  },
  {
    id: 10,
    name: "Recommendations",
    path: "/dashboard/admin/recommendations",
    type: ACCOUNT_TYPE.ADMIN,
    icon: "VscStarFull",
  },
];
