import { memo } from "react";

const StartButtonIcon = memo(() => (
  <svg 
    fill="none" 
    height="100%"
    stroke="white"  {/* Change this line */}
    strokeLinecap="round" 
    strokeLinejoin="round" 
    strokeWidth="2" 
    viewBox="0 0 24 24" 
    width="100%" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="m14 10 7-7"/>
    <path d="M20 10h-6V4"/>
    <path d="m3 21 7-7"/>
    <path d="M4 14h6v6"/>
  </svg>
));

export default StartButtonIcon;
