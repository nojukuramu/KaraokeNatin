use local_ip_address::local_ip;
use crate::web_server;

/// Get the local IP address of the host machine
pub fn get_local_ip() -> Result<String, String> {
    local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| format!("Failed to get local IP: {}", e))
}

/// Generate the QR URL for clients to connect
pub fn generate_qr_url() -> Result<String, String> {
    let ip = get_local_ip()?;
    let port = web_server::get_server_port();
    Ok(format!("http://{}:{}", ip, port))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_local_ip() {
        let ip = get_local_ip();
        assert!(ip.is_ok());
        println!("Local IP: {}", ip.unwrap());
    }

    #[test]
    fn test_generate_qr_url() {
        let url = generate_qr_url();
        assert!(url.is_ok());
        assert!(url.unwrap().starts_with("http://"));
    }
}
