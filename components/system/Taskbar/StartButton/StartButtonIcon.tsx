import { memo } from "react";

const StartButtonIcon = memo(() => (
  <svg 
    viewBox="0 0 24 24" 
    xmlns="http://www.w3.org/2000/svg"
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    width="100%" 
    height="100%"
  >
    <path d="m14 10 7-7"/>
    <path d="M20 10h-6V4"/>
    <path d="m3 21 7-7"/>
    <path d="M4 14h6v6"/>
  </svg>
));

export default StartButtonIcon;
