#!/usr/bin/env bash
# --plan is local and read-only; --check only reads the Google project.
# --apply creates billable resources, but never links/enables a billing account.
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPASSO_PROJECT="${COMPASSO_PROJECT:-compasso-b1121}"
COMPASSO_REGION="${COMPASSO_REGION:-us-central1}"
COMPASSO_REPOSITORY=compasso
COMPASSO_SERVICE=compasso-api
COMPASSO_JOB=compasso-transcribe
COMPASSO_BUCKET="${COMPASSO_PROJECT}-compasso-jobs"
COMPASSO_BUILD_BUCKET="${COMPASSO_PROJECT}-compasso-builds"
COMPASSO_API_SA="compasso-api@${COMPASSO_PROJECT}.iam.gserviceaccount.com"
COMPASSO_WORKER_SA="compasso-worker@${COMPASSO_PROJECT}.iam.gserviceaccount.com"
COMPASSO_BUILD_SA="compasso-build@${COMPASSO_PROJECT}.iam.gserviceaccount.com"
COMPASSO_SECRET=compasso-access-token

plan() {
  cat <<EOF
Projeto: $COMPASSO_PROJECT
Região: $COMPASSO_REGION
Tela existente: https://gabriel20gvn.github.io/Meu-app/

Recursos que --apply criará/atualizará:
- Cloud Run API: 1 vCPU, 512 MiB, mínimo 0, máximo 1 instância, timeout 180 s.
- Cloud Run Job: 1 vCPU, 2 GiB, 1 tarefa, timeout 600 s, sem repetição automática.
- Limites do aplicativo: 1 análise por vez, 3 tentativas/dia, áudio até 5 min/25 MiB.
- Firestore Native (default): estado e limite de uso; expiração após 24 h.
- Bucket privado $COMPASSO_BUCKET: áudio temporário e MIDI; exclusão por idade de 1 dia.
- Artifact Registry: imagens da API e IA; preserva a versão mais recente de cada imagem.
- Cloud Build e bucket privado $COMPASSO_BUILD_BUCKET: preparação das imagens.
- Secret Manager: uma chave de acesso; contas de serviço sem chaves JSON.
- Seu usuário ativo no Cloud Shell recebe a função de usar somente essas três contas de serviço.

Não é uma garantia de custo zero ou de teto em reais.
Processamento, imagens armazenadas, builds, Firestore, Storage, logs e segredo podem gerar cobrança.
Mesmo sem análises, imagens/segredo armazenados podem ter custo.
As franquias gratuitas dependem do serviço, região e uso da conta.
--plan não acessa a conta. --check só consulta. --apply exige faturamento já ativado.
EOF
}

check_project() {
  command -v gcloud >/dev/null || { echo 'Abra este comando no Google Cloud Shell.' >&2; return 1; }
  gcloud projects describe "$COMPASSO_PROJECT" --format='table(projectId,name,lifecycleState)'
  local enabled
  enabled="$(gcloud billing projects describe "$COMPASSO_PROJECT" --format='value(billingEnabled)')"
  if [[ "$enabled" != True && "$enabled" != true ]]; then
    echo 'O projeto existe, mas o faturamento ainda está desativado. Nenhum recurso foi criado.'
    echo 'Revise cloud/google/README.md antes de optar por ativar Blaze/faturamento.'
    return 3
  fi
  echo 'Faturamento ativo. Esta consulta não criou recursos nem executou a IA.'
}

case "${1:---plan}" in
  --plan) plan; exit 0 ;;
  --check) plan; check_project; exit 0 ;;
  --apply) plan; check_project ;;
  *) echo 'Use --plan, --check ou --apply.' >&2; exit 2 ;;
esac

# All mutations below require the explicit --apply command.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com iam.googleapis.com \
  --project="$COMPASSO_PROJECT" --quiet

for compasso_account in compasso-api compasso-worker compasso-build; do
  if ! gcloud iam service-accounts describe "$compasso_account@$COMPASSO_PROJECT.iam.gserviceaccount.com" --project="$COMPASSO_PROJECT" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$compasso_account" --project="$COMPASSO_PROJECT" --quiet
  fi
done

compasso_operator="$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1)"
[[ -n "$compasso_operator" ]] || { echo "Entre na sua conta no Cloud Shell antes de aplicar." >&2; exit 1; }
for compasso_account in "$COMPASSO_API_SA" "$COMPASSO_WORKER_SA" "$COMPASSO_BUILD_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$compasso_account" --member="user:$compasso_operator" \
    --role=roles/iam.serviceAccountUser --project="$COMPASSO_PROJECT" --quiet >/dev/null
done

if ! gcloud artifacts repositories describe "$COMPASSO_REPOSITORY" --location="$COMPASSO_REGION" --project="$COMPASSO_PROJECT" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$COMPASSO_REPOSITORY" --repository-format=docker --location="$COMPASSO_REGION" --project="$COMPASSO_PROJECT" --quiet
fi
gcloud artifacts repositories add-iam-policy-binding "$COMPASSO_REPOSITORY" --location="$COMPASSO_REGION" \
  --member="serviceAccount:$COMPASSO_BUILD_SA" --role=roles/artifactregistry.writer --project="$COMPASSO_PROJECT" --quiet >/dev/null
gcloud artifacts repositories set-cleanup-policies "$COMPASSO_REPOSITORY" --location="$COMPASSO_REGION" \
  --policy=cloud/google/artifact-cleanup.json --project="$COMPASSO_PROJECT" --quiet

for compasso_bucket in "$COMPASSO_BUCKET" "$COMPASSO_BUILD_BUCKET"; do
  if ! gcloud storage buckets describe "gs://$compasso_bucket" --project="$COMPASSO_PROJECT" >/dev/null 2>&1; then
    gcloud storage buckets create "gs://$compasso_bucket" --location="$COMPASSO_REGION" \
      --uniform-bucket-level-access --public-access-prevention --project="$COMPASSO_PROJECT"
  fi
  gcloud storage buckets update "gs://$compasso_bucket" --lifecycle-file=cloud/google/object-lifecycle.json \
    --soft-delete-duration=0 --project="$COMPASSO_PROJECT"
done
for compasso_account in "$COMPASSO_API_SA" "$COMPASSO_WORKER_SA"; do
  gcloud storage buckets add-iam-policy-binding "gs://$COMPASSO_BUCKET" --member="serviceAccount:$compasso_account" \
    --role=roles/storage.objectAdmin --project="$COMPASSO_PROJECT" >/dev/null
  gcloud projects add-iam-policy-binding "$COMPASSO_PROJECT" --member="serviceAccount:$compasso_account" \
    --role=roles/datastore.user --condition=None --quiet >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://$COMPASSO_BUILD_BUCKET" --member="serviceAccount:$COMPASSO_BUILD_SA" \
  --role=roles/storage.objectAdmin --project="$COMPASSO_PROJECT" >/dev/null
gcloud projects add-iam-policy-binding "$COMPASSO_PROJECT" --member="serviceAccount:$COMPASSO_BUILD_SA" \
  --role=roles/logging.logWriter --condition=None --quiet >/dev/null

if ! gcloud firestore databases describe --database='(default)' --project="$COMPASSO_PROJECT" >/dev/null 2>&1; then
  gcloud firestore databases create --database='(default)' --location="$COMPASSO_REGION" --type=firestore-native --project="$COMPASSO_PROJECT" --quiet
fi
compasso_database_type="$(gcloud firestore databases describe --database='(default)' --project="$COMPASSO_PROJECT" --format='value(type)')"
[[ "$compasso_database_type" == FIRESTORE_NATIVE ]] || { echo 'O banco (default) precisa ser Firestore Native. Nada foi excluído.' >&2; exit 1; }
gcloud firestore fields ttls update expires_at --collection-group=compasso_jobs --enable-ttl --project="$COMPASSO_PROJECT" --quiet

if ! gcloud secrets describe "$COMPASSO_SECRET" --project="$COMPASSO_PROJECT" >/dev/null 2>&1; then
  compasso_secret_file="$(mktemp)"
  trap 'rm -f "${compasso_secret_file:-}"' EXIT
  python3 -c 'import secrets; print(secrets.token_urlsafe(32), end="")' > "$compasso_secret_file"
  gcloud secrets create "$COMPASSO_SECRET" --replication-policy=automatic --data-file="$compasso_secret_file" --project="$COMPASSO_PROJECT" --quiet
  rm -f "$compasso_secret_file"
fi
gcloud secrets add-iam-policy-binding "$COMPASSO_SECRET" --member="serviceAccount:$COMPASSO_API_SA" \
  --role=roles/secretmanager.secretAccessor --project="$COMPASSO_PROJECT" --quiet >/dev/null

compasso_tag="$(git rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)"
compasso_image_prefix="$COMPASSO_REGION-docker.pkg.dev/$COMPASSO_PROJECT/$COMPASSO_REPOSITORY"
compasso_api_image="$compasso_image_prefix/api:$compasso_tag"
compasso_worker_image="$compasso_image_prefix/worker:$compasso_tag"
gcloud builds submit . --config=cloud/google/cloudbuild.yaml --project="$COMPASSO_PROJECT" \
  --service-account="projects/$COMPASSO_PROJECT/serviceAccounts/$COMPASSO_BUILD_SA" \
  --gcs-source-staging-dir="gs://$COMPASSO_BUILD_BUCKET/source" \
  --substitutions="_API_IMAGE=$compasso_api_image,_WORKER_IMAGE=$compasso_worker_image" --quiet

compasso_shared_env="GOOGLE_CLOUD_PROJECT=$COMPASSO_PROJECT,COMPASSO_BUCKET=$COMPASSO_BUCKET,COMPASSO_MAX_AUDIO_MB=25,COMPASSO_MAX_AUDIO_SECONDS=300"
gcloud run jobs deploy "$COMPASSO_JOB" --image="$compasso_worker_image" --region="$COMPASSO_REGION" \
  --service-account="$COMPASSO_WORKER_SA" --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=600s \
  --cpu=1 --memory=2Gi --set-env-vars="$compasso_shared_env" --project="$COMPASSO_PROJECT" --quiet
gcloud run jobs add-iam-policy-binding "$COMPASSO_JOB" --region="$COMPASSO_REGION" \
  --member="serviceAccount:$COMPASSO_API_SA" --role=roles/run.invoker --project="$COMPASSO_PROJECT" --quiet >/dev/null

compasso_job_path="projects/$COMPASSO_PROJECT/locations/$COMPASSO_REGION/jobs/$COMPASSO_JOB"
gcloud run deploy "$COMPASSO_SERVICE" --image="$compasso_api_image" --region="$COMPASSO_REGION" \
  --service-account="$COMPASSO_API_SA" --cpu=1 --memory=512Mi --concurrency=8 --timeout=180s \
  --min-instances=0 --max-instances=1 --cpu-throttling --allow-unauthenticated \
  --set-env-vars="$compasso_shared_env,COMPASSO_BACKEND=cloud-run,COMPASSO_DAILY_LIMIT=3,COMPASSO_RUN_JOB=$compasso_job_path,COMPASSO_ALLOWED_ORIGINS=https://gabriel20gvn.github.io" \
  --set-secrets="COMPASSO_API_TOKEN=$COMPASSO_SECRET:latest" --project="$COMPASSO_PROJECT" --quiet

echo 'Endereço do processador para configurar no aplicativo:'
gcloud run services describe "$COMPASSO_SERVICE" --region="$COMPASSO_REGION" --project="$COMPASSO_PROJECT" --format='value(status.url)'
echo "Chave: consulte Secret Manager > $COMPASSO_SECRET > versão mais recente, na sua conta. Não envie a chave pelo chat."
echo 'Nenhuma música foi analisada automaticamente. Comece com um trecho de até 1 minuto.'
