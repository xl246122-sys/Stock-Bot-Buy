import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import {PersonalDeviceGate} from './components/PersonalDeviceGate';

// Stock-G 美股 AI 机器人交易信号预警系统 (旗舰融合版 5-Tab)
// 默认统一加载最新整合系统；如需传统全量桌面控制台可通过 #desktop-console 访问
const App = React.lazy(() => import('./components/MobileRadar'));

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RootErrorBoundary] Caught exception:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#0b0e14',
          color: '#f8fafc',
          padding: '24px',
          fontFamily: 'sans-serif',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '28px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            marginBottom: '16px'
          }}>
            ⚠️
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#f1f5f9' }}>
            量化监控核心加载异常
          </h2>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 20px 0', maxWidth: '320px', lineHeight: 1.5 }}>
            {this.state.error?.message || '运行时组件加载失败，请尝试刷新重新初始化引擎'}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            重新加载引擎
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <React.Suspense fallback={<div style={{ padding: 24 }}>正在加载 Stock-G…</div>}>
      <PersonalDeviceGate><App /></PersonalDeviceGate>
    </React.Suspense>
  </RootErrorBoundary>
);
