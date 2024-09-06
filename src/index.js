import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import rootReducer from "./reducer";
import {configureStore} from "@reduxjs/toolkit"
import { Toaster } from "react-hot-toast";

import { GoogleOAuthProvider } from '@react-oauth/google';

const store = configureStore({
  reducer:rootReducer,
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
  <Provider store = {store}>
    <BrowserRouter>
      <GoogleOAuthProvider clientId="15702441501-ja73diekukrtqkbr2jeoo70n47n4d8gn.apps.googleusercontent.com">
        <App />
      </GoogleOAuthProvider>
     <Toaster/>
    </BrowserRouter>
      
  </Provider>
    
    
  </React.StrictMode>
);
