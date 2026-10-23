import React from 'react';
import {AiAlertCard} from './AiAlertCard';
import {AiAlertCardData} from '../services/aiBrainService';
import {StockQuote} from '../types/stock';
interface Props {alert:AiAlertCardData|null;onClose:()=>void;onOpenStockDetail?:(s:StockQuote)=>void;stocks?:StockQuote[];}
export const AiAlertModal:React.FC<Props> = ({alert,onClose}) => alert ? <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4"><div className="w-full max-w-md"><AiAlertCard alert={alert}/><button onClick={onClose} className="w-full p-3 rounded-xl bg-blue-600 text-white mt-2">知道了</button></div></div> : null;
