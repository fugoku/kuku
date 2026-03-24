use async_trait::async_trait;

use crate::{
    AiError,
    mutation::{MutationApplyResult, MutationPlan},
};

#[async_trait]
pub trait AiHostBindings: Send + Sync {
    async fn apply_mutation(&self, plan: MutationPlan) -> Result<MutationApplyResult, AiError>;
}
