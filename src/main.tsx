import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Canopy UI error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#eef3ea] text-[#12261b]">
          <div className="max-w-md rounded-2xl border border-[#d3ddcf] bg-[#fbfdf8] p-6">
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-[#55685c] mb-4">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#2c7a4b] text-white px-4 py-2 text-sm font-semibold cursor-pointer"
            >
              Reload Canopy
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
