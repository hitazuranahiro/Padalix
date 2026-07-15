import type{Metadata,Viewport}from"next";import{DM_Mono,Manrope}from"next/font/google";import"./globals.css";
import "./functional.css";
const sans=Manrope({subsets:["latin"],variable:"--font-sans",display:"swap"});const mono=DM_Mono({weight:["400","500"],subsets:["latin"],variable:"--font-mono",display:"swap"});
export const metadata:Metadata={title:{default:"Padalix",template:"%s | Padalix"},description:"Padalix customer payments application.",manifest:"/manifest.webmanifest",robots:{index:false,follow:false}};export const viewport:Viewport={themeColor:"#050505",colorScheme:"dark"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body>{children}</body></html>}
