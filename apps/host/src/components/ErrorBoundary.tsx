import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '40px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    minHeight: '100vh',
                    color: 'white',
                    fontFamily: 'monospace'
                }}>
                    <h1>⚠️ KaraokeNatin Error</h1>
                    <p style={{ marginTop: '20px', fontSize: '18px' }}>
                        Something went wrong loading the app.
                    </p>

                    <div style={{
                        marginTop: '30px',
                        padding: '20px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '10px'
                    }}>
                        <h2>Error Details:</h2>
                        <pre style={{
                            marginTop: '10px',
                            whiteSpace: 'pre-wrap',
                            overflow: 'auto'
                        }}>
                            {this.state.error?.toString()}
                        </pre>

                        {this.state.errorInfo && (
                            <>
                                <h3 style={{ marginTop: '20px' }}>Stack Trace:</h3>
                                <pre style={{
                                    marginTop: '10px',
                                    fontSize: '12px',
                                    whiteSpace: 'pre-wrap',
                                    overflow: 'auto',
                                    maxHeight: '300px'
                                }}>
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </>
                        )}
                    </div>

                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '30px',
                            padding: '15px 30px',
                            fontSize: '16px',
                            background: 'white',
                            color: '#667eea',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer'
                        }}
                    >
                        Reload App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
