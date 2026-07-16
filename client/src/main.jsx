import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => (err?.status >= 400 && err?.status < 500 ? false : count < 2),
      staleTime: 20000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-right" closeButton toastOptions={{ style: { fontSize: 13 } }} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
