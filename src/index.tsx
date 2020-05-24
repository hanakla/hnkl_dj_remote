import domready from "domready";
import React from "react";
import ReactDOM from "react-dom";
import { App } from "./components/App";

domready(async () => {
  ReactDOM.render(<App />, document.getElementById("root"));
});
