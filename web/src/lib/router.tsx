import React, { createContext, useContext, useState, useEffect } from 'react';

interface RouterContextType {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextType>({
  path: window.location.pathname,
  navigate: () => {},
});

export const BrowserRouter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
      setPath(to);
    }
  };

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useNavigate = () => {
  const { navigate } = useContext(RouterContext);
  return navigate;
};

export const Routes: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { path } = useContext(RouterContext);

  let match: React.ReactNode = null;
  React.Children.forEach(children, (child) => {
    if (match) return;
    if (React.isValidElement(child)) {
      const childProps = child.props as { path?: string; element?: React.ReactNode };
      if (childProps.path === '*' || childProps.path === path) {
        match = childProps.element;
      }
    }
  });

  return <>{match}</>;
};

export const Route: React.FC<{ path: string; element: React.ReactNode }> = () => {
  return null;
};

export const Navigate: React.FC<{ to: string; replace?: boolean }> = ({ to }) => {
  const { navigate } = useContext(RouterContext);
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
};
