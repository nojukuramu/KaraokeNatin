import { invoke } from '@tauri-apps/api/core';

interface HelpDialogProps {
    onClose: () => void;
}

const HelpDialog = ({ onClose }: HelpDialogProps) => {
    const handleOpenLogs = async () => {
        try {
            await invoke('open_log_folder');
        } catch (error) {
            console.error('Failed to open logs:', error);
        }
    };

    const handleReportIssue = async () => {
        try {
            await invoke('report_issue');
        } catch (error) {
            console.error('Failed to report issue:', error);
        }
    };

    return (
        <div className="help-overlay">
            <div className="help-content">
                <h2 style={{ marginBottom: '16px', color: 'var(--text-primary, #fff)' }}>Help & Support</h2>
                <p style={{ marginBottom: '24px', color: 'var(--text-secondary, #ccc)' }}>
                    Encountered an issue? Help us fix it by reporting it on GitHub.
                    Please attach the logs from the logs folder to your issue.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                        className="btn-secondary"
                        onClick={handleOpenLogs}
                    >
                        📂 Open Logs Folder
                    </button>

                    <button
                        className="btn-primary"
                        onClick={handleReportIssue}
                    >
                        🐛 Report on GitHub
                    </button>
                </div>

                <button
                    className="btn-close"
                    onClick={onClose}
                    style={{ marginTop: '24px' }}
                >
                    Close
                </button>
            </div>

            <style>{`
                .help-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.8);
                    z-index: 2000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.2s ease-out;
                }

                .help-content {
                    background: var(--bg-secondary, #22303c);
                    padding: 32px;
                    border-radius: 16px;
                    width: 90%;
                    max-width: 400px;
                    text-align: center;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                }

                .btn-primary, .btn-secondary, .btn-close {
                    padding: 12px 24px;
                    border-radius: 8px;
                    border: none;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    width: 100%;
                }

                .btn-primary {
                    background: var(--accent, #1da1f2);
                    color: white;
                }

                .btn-primary:hover {
                    background: var(--accent-hover, #1a91da);
                }

                .btn-secondary {
                    background: var(--bg-tertiary, #15202b);
                    color: var(--text-primary, #fff);
                    border: 1px solid var(--border, #38444d);
                }

                .btn-secondary:hover {
                    background: var(--bg-hover, #1c2732);
                }

                .btn-close {
                    background: transparent;
                    color: var(--text-secondary, #8899a6);
                }

                .btn-close:hover {
                    color: var(--text-primary, #fff);
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default HelpDialog;
