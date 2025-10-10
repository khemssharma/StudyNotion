import { useEffect, useState } from "react"
import { AiOutlineShoppingCart } from "react-icons/ai"
import { IoMdMore } from "react-icons/io";
import { RxCross1 } from "react-icons/rx";
import { BsChevronDown } from "react-icons/bs"
import { useSelector } from "react-redux"
import { Link, matchPath, useLocation } from "react-router-dom"

import logo from "../../assets/Logo/Logo-Full-Light.png"
import { NavbarLinks } from "../../data/navbar-links"
import { apiConnector } from "../../services/apiconnector"
import { categories } from "../../services/apis"
import { ACCOUNT_TYPE } from "../../utils/constants"
import ProfileDropdown from "../core/Auth/ProfileDropDown"
import { useNavigate } from "react-router-dom";

function Navbar() {
  const { token } = useSelector((state) => state.auth)
  const { user } = useSelector((state) => state.profile)
  const { totalItems } = useSelector((state) => state.cart)
  const location = useLocation()

  const [subLinks, setSubLinks] = useState([])
  const [loading, setLoading] = useState(false)

  // Search bar state
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  
  // Handle search submit
  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await apiConnector("GET", `/mock-api/search?query=${encodeURIComponent(searchQuery)}`);

      console.log("Search results:", res.data);
      navigate(`/search/${encodeURIComponent(searchQuery)}`);
    } catch (error) {
      console.error("Search failed:", error);
    }
  };
  const [showSearch, setShowSearch] = useState(false);

  // moblie view
  const [open, setOpen] = useState(false); //mobile dropdown state
  
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const res = await apiConnector("GET", categories.CATEGORIES_API)
        setSubLinks(res.data.data)
      } catch (error) {
        console.log("Could not fetch Categories.", error)
      }
      setLoading(false)
    })()
  }, [])

  // console.log("sub links", subLinks)

  const matchRoute = (route) => {
    return matchPath({ path: route }, location.pathname)
  }

  return (
    <div
      className={`flex h-14 items-center justify-center border-b-[1px] border-b-richblack-700 ${
        location.pathname !== "/" ? "bg-richblack-800" : ""
      } transition-all duration-200`}
    >
      <div className="flex w-11/12 max-w-maxContent items-center justify-between">
        {/* Logo */}
        <Link to="/">
          <img src={logo} alt="Logo" width={160} height={32} loading="lazy" />
        </Link>
        {/* Navigation links */}
        <nav className="hidden md:block">
          <ul className="flex gap-x-6 text-richblack-25">
            {NavbarLinks.map((link, index) => (
              <li key={index}>
                {link.title === "Catalog" ? (
                  <>
                    <div
                      className={`group relative flex cursor-pointer items-center gap-1 ${
                        matchRoute("/catalog/:catalogName")
                          ? "text-yellow-25"
                          : "text-richblack-25"
                      }`}
                    >
                      <p>{link.title}</p>
                      <BsChevronDown />
                      <div className="invisible absolute left-[50%] top-[50%] z-[1000] flex w-[200px] translate-x-[-50%] translate-y-[3em] flex-col rounded-lg bg-richblack-5 p-4 text-richblack-900 opacity-0 transition-all duration-150 group-hover:visible group-hover:translate-y-[1.65em] group-hover:opacity-100 lg:w-[300px]">
                        <div className="absolute left-[50%] top-0 -z-10 h-6 w-6 translate-x-[80%] translate-y-[-40%] rotate-45 select-none rounded bg-richblack-5"></div>
                        {loading ? (
                          <p className="text-center">Loading...</p>
                        ) : subLinks.length ? (
                          <>
                            {subLinks
                              ?.filter(
                                (subLink) => subLink?.courses?.length > 0
                              )
                              ?.map((subLink, i) => (
                                <Link
                                  to={`/catalog/${subLink.name
                                    .split(" ")
                                    .join("-")
                                    .toLowerCase()}`}
                                  className="rounded-lg bg-transparent py-4 pl-4 hover:bg-richblack-50"
                                  key={i}
                                >
                                  <p>{subLink.name}</p>
                                </Link>
                              ))}
                          </>
                        ) : (
                          <p className="text-center">No Courses Found</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <Link to={link?.path}>
                    <p
                      className={`${
                        matchRoute(link?.path)
                          ? "text-yellow-25"
                          : "text-richblack-25"
                      }`}
                    >
                      {link.title}
                    </p>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        {/* Login / Signup / Dashboard */}
          <div className="hidden items-center gap-x-4 md:flex">
            {/* Search Icon and Search Bar */}
            <div className="relative">
              <button
                className="p-2"
                onClick={() => setShowSearch((prev) => !prev)}
                aria-label="Open search"
              >
                <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-richblack-100"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
                >
            <circle cx="11" cy="11" r="7" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" strokeWidth="2" />
                </svg>
              </button>
              <div
                className={`absolute right-0 top-10 z-50 w-64 transition-all duration-300 ${
            showSearch
              ? "opacity-100 visible translate-y-0"
              : "opacity-0 invisible -translate-y-2"
                }`}
              >
            <form onSubmit={handleSearchSubmit}>
              <input
                type="text"
                className="w-full rounded-md border border-richblack-700 bg-richblack-800 px-3 py-2 text-richblack-100 focus:outline-none focus:ring-2 focus:ring-yellow-50"
                placeholder="Search courses..."
                autoFocus={showSearch}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => setShowSearch(false)}
              />
            </form>
              </div>
            </div>
            {user && user?.accountType !== ACCOUNT_TYPE.INSTRUCTOR && (
              <Link to="/dashboard/cart" className="relative">
                <AiOutlineShoppingCart className="text-2xl text-richblack-100" />
                {totalItems > 0 && (
            <span className="absolute -bottom-2 -right-2 grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-richblack-600 text-center text-xs font-bold text-yellow-100">
              {totalItems}
            </span>
                )}
              </Link>
            )}
            {token === null && (
              <Link to="/login">
                <button className="rounded-[8px] border border-richblack-700 bg-richblack-800 px-[12px] py-[8px] text-richblack-100">
            Log in
                </button>
              </Link>
            )}
            {token === null && (
              <Link to="/signup">
                <button className="rounded-[8px] border border-richblack-700 bg-richblack-800 px-[12px] py-[8px] text-richblack-100">
            Sign up
                </button>
              </Link>
            )}
            {token !== null && <ProfileDropdown />}
          </div>

          {/*mobile dropdown icon*/}

       <div className="flex items-center gap-x-4 md:hidden">
          <button className="md:hidden" onClick={() => setOpen(!open)}>
            < IoMdMore  fontSize={24} fill="#AFB2BF" />
          </button>
          {user && user?.accountType !== ACCOUNT_TYPE.INSTRUCTOR && (
            <Link to="/dashboard/cart" className="relative">
              <AiOutlineShoppingCart className="text-2xl text-richblack-100"/>
              {totalItems > 0 && (
                <span className="absolute -bottom-2 -right-2 grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-richblack-600 text-center text-xs font-bold text-yellow-100">
                  {totalItems}
                </span>
              )}
            </Link>
          )}
          {token !== null && <ProfileDropdown />}

          {open && (
          <div className = "fixed w-full bg-[#0000005f] z-20 h-full top-0 right-0">
            <div className="fixed w-full bg-richblack-800 h-screen top-0 right-0 z-10 overflow-y-scroll">
              <div className="w-full justify-between pr-3">
                  <div className="relative mr-[15px]">
                    {/*dropdown menu*/}
                    {/*close icon*/}

                    <button className="mr-4 mt-4 ml-4 md:hidden" onClick={() => setOpen(!open)}>
                      <RxCross1  fontSize={30} className="text-2xl text-richblack-100"/> 
                    </button>

                    <div className="flex flex-col items-center justify-center h-screen">
                      
                      {/* Navigation links */}

                      <ul className="flex flex-col items-center justify-center gap-y-6 text-richblack-25 ">
                        {NavbarLinks.map((link, index) => (
                          <li key={index}>
                            {link.title === "Catalog" ? (
                              <>
                                <div
                                  className={`group relative flex cursor-pointer items-center gap-1 ${
                                    matchRoute("/catalog/:catalogName")
                                      ? "text-yellow-25"
                                      : "text-richblack-25"
                                  }`} 
                                >
                                  <p >{link.title}</p>
                                  <BsChevronDown />
                                  <div onClick={() => setOpen(!open)} className="invisible absolute left-[50%] top-[50%] z-[1000] flex w-[200px] translate-x-[-50%] translate-y-[3em] flex-col rounded-lg bg-richblack-5 p-4 text-richblack-900 opacity-0 transition-all duration-150 group-hover:visible group-hover:translate-y-[1.65em] group-hover:opacity-100 lg:w-[300px]">
                                    <div className="absolute left-[50%] top-0 -z-10 h-6 w-6 translate-x-[80%] translate-y-[-40%] rotate-45 select-none rounded bg-richblack-5"></div>
                                    {loading ? (
                                      <p className="text-center">Loading...</p>
                                    ) : subLinks.length ? (
                                      <>
                                        {subLinks
                                          ?.filter(
                                            (subLink) => subLink?.courses?.length > 0
                                          )
                                          ?.map((subLink, i) => (
                                            <Link
                                              to={`/catalog/${subLink.name
                                                .split(" ")
                                                .join("-")
                                                .toLowerCase()}`}
                                              className="rounded-lg bg-transparent py-4 pl-4 hover:bg-richblack-50"
                                              key={i}
                                            >
                                              <p>{subLink.name}</p>
                                            </Link>
                                          ))}
                                      </>
                                    ) : (
                                      <p className="text-center">No Courses Found</p>
                                    )}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <Link to={link?.path} onClick={() => setOpen(!open)}>
                                <p
                                  className={`${
                                    matchRoute(link?.path)
                                      ? "text-yellow-25"
                                      : "text-richblack-25"
                                  }`}
                                >
                                  {link.title}
                                </p>
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>

                      {/* Login / Signup / Dashboard */}

                      <div className="mt-6 flex flex-row items-center justify-center gap-x-4">
                      {token === null && (
                        <Link to="/login" onClick={() => setOpen(!open)}>
                          <button className="rounded-[8px] border border-richblack-700 bg-richblack-800 px-[12px] py-[8px] text-richblack-100">
                            Log in
                          </button>
                        </Link>
                      )}
                      {token === null && (
                        <Link to="/signup" onClick={() => setOpen(!open)}>
                          <button className="rounded-[8px] border border-richblack-700 bg-richblack-800 px-[12px] py-[8px] text-richblack-100">
                            Sign up
                          </button>
                        </Link>
                      )}
                    </div>
                    </div>
                    
                  </div>
                </div>
              </div>
            </div>
          )
        }
        </div>        
      </div>
    </div>
  )
}

export default Navbar