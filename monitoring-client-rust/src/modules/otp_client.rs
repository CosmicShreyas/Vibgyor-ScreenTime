//! OTP Client Module
//!
//! Handles OTP request and verification with the server

use crate::modules::error::{MonitoringError, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{error, info};

#[derive(Debug, Serialize)]
struct OTPRequest {
    client_id: String,
    employee_name: String,
    employee_id: String,
}

#[derive(Debug, Serialize)]
struct OTPVerification {
    client_id: String,
    otp: String,
}

#[derive(Debug, Deserialize)]
struct OTPResponse {
    success: bool,
    message: String,
}

/// OTP Client for requesting and verifying OTPs
pub struct OTPClient {
    server_url: String,
    auth_token: String,
    client: Client,
}

impl OTPClient {
    /// Create a new OTP client
    pub fn new(server_url: String, auth_token: String) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        Ok(Self {
            server_url,
            auth_token,
            client,
        })
    }

    /// Request OTP from server
    pub async fn request_otp(
        &self,
        client_id: &str,
        employee_name: &str,
        employee_id: &str,
    ) -> Result<String> {
        info!("📧 Requesting OTP from server...");

        let url = format!("{}/api/otp/request", self.server_url);

        let request_body = OTPRequest {
            client_id: client_id.to_string(),
            employee_name: employee_name.to_string(),
            employee_id: employee_id.to_string(),
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.auth_token))
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            error!("❌ OTP request failed: {}", error_text);
            return Err(MonitoringError::Config(format!(
                "OTP request failed: {}",
                error_text
            )));
        }

        let otp_response: OTPResponse = response.json().await?;

        if !otp_response.success {
            error!("❌ OTP request failed: {}", otp_response.message);
            return Err(MonitoringError::Config(otp_response.message));
        }

        info!("✅ {}", otp_response.message);
        Ok(otp_response.message)
    }

    /// Verify OTP with server
    pub async fn verify_otp(&self, client_id: &str, otp: &str) -> Result<()> {
        info!("🔐 Verifying OTP with server...");

        let url = format!("{}/api/otp/verify", self.server_url);

        let verification_body = OTPVerification {
            client_id: client_id.to_string(),
            otp: otp.to_string(),
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.auth_token))
            .json(&verification_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            error!("❌ OTP verification failed: {}", error_text);
            return Err(MonitoringError::Config(format!(
                "OTP verification failed: {}",
                error_text
            )));
        }

        let otp_response: OTPResponse = response.json().await?;

        if !otp_response.success {
            error!("❌ OTP verification failed: {}", otp_response.message);
            return Err(MonitoringError::Config(otp_response.message));
        }

        info!("✅ {}", otp_response.message);
        Ok(())
    }
}
