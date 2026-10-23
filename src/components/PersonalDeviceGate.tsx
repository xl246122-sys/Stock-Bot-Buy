import React,{useEffect,useState} from 'react';
import {licenseService} from '../services/licenseService';
import {LicenseActivationModal} from './LicenseActivationModal';
export function PersonalDeviceGate({children}:{children:React.ReactNode}){
 const [info,setInfo]=useState(()=>licenseService.getLicenseInfo());
 useEffect(()=>{const unsubscribe=licenseService.subscribe(setInfo);void licenseService.verify(true);const timer=window.setInterval(()=>void licenseService.verify(true),60000);return()=>{unsubscribe();window.clearInterval(timer);};},[]);
 return info.isActivated?<>{children}</>:<LicenseActivationModal isOpen onClose={()=>{}}/>;
}
