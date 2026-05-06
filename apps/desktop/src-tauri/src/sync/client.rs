#![allow(dead_code)]

use async_trait::async_trait;
use connectrpc::client::CallOptions;
use kuku_contract::buffa::EnumValue;
use kuku_contract::proto::kuku::sync::v1::{
    CompleteObjectUploadBatchRequest, CompletedObjectUpload, CreateObjectDownloadBatchRequest,
    CreateObjectUploadBatchRequest, ObjectDownloadTarget, ObjectReservation,
    ObjectReservationRequest, ObjectUploadResult, ReserveObjectIdsRequest, SyncHttpHeader,
    SyncObject, SyncObjectErrorReason, SyncObjectKind, UploadObjectDescriptor,
};

use crate::contract_client;

use super::errors::{SyncError, SyncResult};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectReservationInput {
    pub client_object_ref: String,
    pub kind: SyncObjectKind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReservedObject {
    pub client_object_ref: String,
    pub object_id: String,
    pub kind: SyncObjectKind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectUploadDescriptor {
    pub object_id: String,
    pub kind: SyncObjectKind,
    pub ciphertext_sha256: String,
    pub size_bytes: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HttpHeader {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectUploadTargetDescriptor {
    pub object_id: String,
    pub put_url: String,
    pub required_headers: Vec<HttpHeader>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompletedObjectUploadDescriptor {
    pub object_id: String,
    pub ciphertext_sha256: String,
    pub size_bytes: i64,
    pub provider_etag: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UploadedObjectMetadata {
    pub object_id: String,
    pub ciphertext_sha256: String,
    pub size_bytes: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectUploadCompletion {
    pub object: Option<UploadedObjectMetadata>,
    pub error_reason: Option<SyncObjectErrorReason>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectDownloadTargetDescriptor {
    pub object_id: String,
    pub kind: SyncObjectKind,
    pub get_url: String,
    pub required_headers: Vec<HttpHeader>,
    pub ciphertext_sha256: String,
    pub size_bytes: i64,
}

#[async_trait]
pub trait SyncTransferApi: Send + Sync {
    async fn reserve_object_ids(
        &self,
        workspace_id: &str,
        device_id: &str,
        objects: Vec<ObjectReservationInput>,
    ) -> SyncResult<Vec<ReservedObject>>;

    async fn create_object_upload_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        upload_attempt_id: &str,
        objects: Vec<ObjectUploadDescriptor>,
    ) -> SyncResult<Vec<ObjectUploadTargetDescriptor>>;

    async fn complete_object_upload_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        upload_attempt_id: &str,
        objects: Vec<CompletedObjectUploadDescriptor>,
    ) -> SyncResult<Vec<ObjectUploadCompletion>>;

    async fn create_object_download_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        object_ids: Vec<String>,
    ) -> SyncResult<Vec<ObjectDownloadTargetDescriptor>>;
}

#[derive(Clone, Debug, Default)]
pub struct ConnectSyncClient {
    authorization_header: Option<String>,
}

impl ConnectSyncClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_authorization_header(header: impl Into<String>) -> Self {
        Self {
            authorization_header: Some(header.into()),
        }
    }

    pub fn with_bearer_access_token(access_token: impl Into<String>) -> Self {
        Self::with_authorization_header(format!("Bearer {}", access_token.into()))
    }

    fn call_options(&self) -> CallOptions {
        match &self.authorization_header {
            Some(header) => CallOptions::default().with_header("authorization", header.clone()),
            None => CallOptions::default(),
        }
    }
}

#[async_trait]
impl SyncTransferApi for ConnectSyncClient {
    async fn reserve_object_ids(
        &self,
        workspace_id: &str,
        device_id: &str,
        objects: Vec<ObjectReservationInput>,
    ) -> SyncResult<Vec<ReservedObject>> {
        let request = ReserveObjectIdsRequest {
            workspace_id: Some(workspace_id.to_string()),
            device_id: Some(device_id.to_string()),
            objects: objects
                .into_iter()
                .map(|object| ObjectReservationRequest {
                    client_object_ref: Some(object.client_object_ref),
                    kind: Some(object.kind.into()),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let response = contract_client::sync_service_client()
            .map_err(SyncError::Transport)?
            .reserve_object_ids_with_options(request, self.call_options())
            .await
            .map_err(|error| SyncError::Transport(format!("ReserveObjectIds failed: {error}")))?
            .into_owned();

        response
            .objects
            .into_iter()
            .map(reserved_object_from_proto)
            .collect()
    }

    async fn create_object_upload_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        upload_attempt_id: &str,
        objects: Vec<ObjectUploadDescriptor>,
    ) -> SyncResult<Vec<ObjectUploadTargetDescriptor>> {
        let request = CreateObjectUploadBatchRequest {
            workspace_id: Some(workspace_id.to_string()),
            device_id: Some(device_id.to_string()),
            upload_attempt_id: Some(upload_attempt_id.to_string()),
            objects: objects
                .into_iter()
                .map(|object| UploadObjectDescriptor {
                    object_id: Some(object.object_id),
                    kind: Some(object.kind.into()),
                    ciphertext_sha256: Some(object.ciphertext_sha256),
                    size_bytes: Some(object.size_bytes),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let response = contract_client::sync_service_client()
            .map_err(SyncError::Transport)?
            .create_object_upload_batch_with_options(request, self.call_options())
            .await
            .map_err(|error| {
                SyncError::Transport(format!("CreateObjectUploadBatch failed: {error}"))
            })?
            .into_owned();

        response
            .objects
            .into_iter()
            .map(upload_target_from_proto)
            .collect()
    }

    async fn complete_object_upload_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        upload_attempt_id: &str,
        objects: Vec<CompletedObjectUploadDescriptor>,
    ) -> SyncResult<Vec<ObjectUploadCompletion>> {
        let request = CompleteObjectUploadBatchRequest {
            workspace_id: Some(workspace_id.to_string()),
            device_id: Some(device_id.to_string()),
            upload_attempt_id: Some(upload_attempt_id.to_string()),
            objects: objects
                .into_iter()
                .map(|object| CompletedObjectUpload {
                    object_id: Some(object.object_id),
                    ciphertext_sha256: Some(object.ciphertext_sha256),
                    size_bytes: Some(object.size_bytes),
                    provider_etag: object.provider_etag,
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let response = contract_client::sync_service_client()
            .map_err(SyncError::Transport)?
            .complete_object_upload_batch_with_options(request, self.call_options())
            .await
            .map_err(|error| {
                SyncError::Transport(format!("CompleteObjectUploadBatch failed: {error}"))
            })?
            .into_owned();

        response
            .objects
            .into_iter()
            .map(upload_completion_from_proto)
            .collect()
    }

    async fn create_object_download_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        object_ids: Vec<String>,
    ) -> SyncResult<Vec<ObjectDownloadTargetDescriptor>> {
        let request = CreateObjectDownloadBatchRequest {
            workspace_id: Some(workspace_id.to_string()),
            device_id: Some(device_id.to_string()),
            object_ids,
            ..Default::default()
        };
        let response = contract_client::sync_service_client()
            .map_err(SyncError::Transport)?
            .create_object_download_batch_with_options(request, self.call_options())
            .await
            .map_err(|error| {
                SyncError::Transport(format!("CreateObjectDownloadBatch failed: {error}"))
            })?
            .into_owned();

        response
            .objects
            .into_iter()
            .map(download_target_from_proto)
            .collect()
    }
}

fn reserved_object_from_proto(value: ObjectReservation) -> SyncResult<ReservedObject> {
    Ok(ReservedObject {
        client_object_ref: required_string(value.client_object_ref, "client_object_ref")?,
        object_id: required_string(value.object_id, "object_id")?,
        kind: required_enum(value.kind, "kind")?,
    })
}

fn upload_target_from_proto(
    value: kuku_contract::proto::kuku::sync::v1::ObjectUploadTarget,
) -> SyncResult<ObjectUploadTargetDescriptor> {
    Ok(ObjectUploadTargetDescriptor {
        object_id: required_string(value.object_id, "object_id")?,
        put_url: required_string(value.put_url, "put_url")?,
        required_headers: headers_from_proto(value.required_headers)?,
    })
}

fn upload_completion_from_proto(value: ObjectUploadResult) -> SyncResult<ObjectUploadCompletion> {
    let object = value
        .object
        .as_option()
        .map(sync_object_metadata_from_proto)
        .transpose()?;
    Ok(ObjectUploadCompletion {
        object,
        error_reason: value.error_reason.and_then(|reason| reason.as_known()),
    })
}

fn download_target_from_proto(
    value: ObjectDownloadTarget,
) -> SyncResult<ObjectDownloadTargetDescriptor> {
    Ok(ObjectDownloadTargetDescriptor {
        object_id: required_string(value.object_id, "object_id")?,
        kind: required_enum(value.kind, "kind")?,
        get_url: required_string(value.get_url, "get_url")?,
        required_headers: headers_from_proto(value.required_headers)?,
        ciphertext_sha256: required_string(value.ciphertext_sha256, "ciphertext_sha256")?,
        size_bytes: required_i64(value.size_bytes, "size_bytes")?,
    })
}

fn sync_object_metadata_from_proto(value: &SyncObject) -> SyncResult<UploadedObjectMetadata> {
    Ok(UploadedObjectMetadata {
        object_id: required_string(value.object_id.clone(), "object.object_id")?,
        ciphertext_sha256: required_string(
            value.ciphertext_sha256.clone(),
            "object.ciphertext_sha256",
        )?,
        size_bytes: required_i64(value.size_bytes, "object.size_bytes")?,
    })
}

fn headers_from_proto(headers: Vec<SyncHttpHeader>) -> SyncResult<Vec<HttpHeader>> {
    headers
        .into_iter()
        .map(|header| {
            Ok(HttpHeader {
                name: required_string(header.name, "header.name")?,
                value: required_string(header.value, "header.value")?,
            })
        })
        .collect()
}

fn required_string(value: Option<String>, field: &str) -> SyncResult<String> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| SyncError::Transport(format!("sync response missing {field}")))
}

fn required_i64(value: Option<i64>, field: &str) -> SyncResult<i64> {
    value.ok_or_else(|| SyncError::Transport(format!("sync response missing {field}")))
}

fn required_enum<E>(value: Option<EnumValue<E>>, field: &str) -> SyncResult<E>
where
    E: kuku_contract::buffa::Enumeration,
{
    value
        .and_then(|value| value.as_known())
        .ok_or_else(|| SyncError::Transport(format!("sync response missing {field}")))
}
