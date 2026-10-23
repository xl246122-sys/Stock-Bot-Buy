import React,{useEffect,useState} from 'react';
import {licenseService} from '../services/licenseService';
export const LicenseActivationModal:React.FC<{isOpen:boolean;onClose:()=>void}>=({isOpen,onClose})=>{
 const [info,setInfo]=useState(()=>licenseService.getLicenseInfo());
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>licenseService.subscribe(setInfo),[]);
 if(!isOpen)return null;
 async function bind(){setBusy(true);try{const result=await licenseService.activate(code);setMessage(result.message);if(result.ok)setCode('');}finally{setBusy(false);}}
 return <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="binding-title">
  <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 text-slate-200">
   <h2 id="binding-title" className="font-bold text-lg text-white">个人设备绑定</h2>
   <p className="text-sm">仅允许预先指定的设备使用，无 VIP 期限。绑定码不随安装包提供。</p>
   <p className="text-sm break-all">本机设备识别码：{info.deviceId}</p>
   <p className="text-emerald-300">{info.isActivated?'已绑定':'等待绑定验证'}</p>
   <label className="block text-sm" htmlFor="private-binding">私人设备绑定码</label>
   <input id="private-binding" type="password" value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" placeholder="输入你收到的设备绑定码" className="w-full rounded-xl bg-slate-950 border border-slate-600 p-3" />
   <p role="status" className="text-sm">{message}</p>
   <button type="button" disabled={busy||!code.trim()} onClick={()=>void bind()} className="w-full rounded-xl bg-blue-600 p-3 text-white disabled:opacity-50">{busy?'验证中…':'验证并绑定设备'}</button>
   {info.isActivated&&<button type="button" onClick={onClose} className="w-full p-2">关闭</button>}
  </section>
 </div>;
};
