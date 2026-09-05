export type Tenant = {
  id: string;
  object: 'tenant';
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'closed';
  // The currency this workspace is billed in. It is chosen when the account is
  // created and never changes: the balance, the quoted prices, and the payment
  // are all in it.
  billing_currency?: string;
  created_at: string;
  updated_at: string;
};

export type User = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  image_enabled?: boolean;
  video_enabled?: boolean;
  email_verified_at?: string;
  created_at: string;
};

// `GET /v1/billing/currency` names the currency this workspace is billed in and
// the currencies a new account may be created in. Amounts are never converted
// through it — every payload already carries its own currency — so the console
// reads it only for a payload that carries none, and for the sign-up form.
// `rate` is base minor units per 100 alternate minor units, so USD 1.00 =
// CNY 7.00 arrives as 700, and is used by the administrator console alone.
export type CurrencyPresentation = {
  object?: 'presentation';
  currency: string;
  base_currency: string;
  rate: number;
  currencies?: string[];
};

export type Balance = {
  object: 'balance';
  tenant_id: string;
  currency: string;
  credited: number;
  spent: number;
  balance: number;
  reserved: number;
  available: number;
  enforced: boolean;
};

export type TransactionRecord = {
  id: string;
  object: 'transaction';
  type: string;
  amount: number;
  currency: string;
  reason: string;
  actor?: string;
  generation_id?: string;
  model?: string;
  modality?: 'image' | 'video';
  prompt?: string;
  created_at: string;
};

export type IdentityProfile = {
  object: 'identity';
  user: User;
  tenant: Tenant;
  role: 'owner' | 'member' | 'billing';
};

export type APIKey = {
  id: string;
  object: 'api_key';
  name: string;
  prefix: string;
  status: 'active' | 'revoked' | 'expired';
  secret_available: boolean;
  expires_at?: string;
  last_used_at?: string;
  revoked_at?: string;
  created_at: string;
};

export type CreatedAPIKey = APIKey & {
  key: string;
};

export type APIKeySecret = {
  object: 'api_key_secret';
  id: string;
  key: string;
};

export type AdminProfile = {
  object: 'administrator';
  email: string;
  status: string;
  last_login_at?: string;
};

export type Generation = {
  id: string;
  modality: 'image' | 'video';
  operation: string;
  model: string;
  status: string;
  billing_status: string;
  quote_amount?: number;
  final_amount?: number;
  currency?: string;
  parameters?: Record<string, unknown>;
  prompt?: string;
  // Only administrator views carry the upstream binding that served the job.
  binding_alias?: string;
  inputs?: GenerationInput[];
  // Present only when the list endpoint is asked for `include=artifacts`.
  artifacts?: Artifact[];
  progress: number;
  created_at: string;
  updated_at: string;
};

export type GenerationInput = {
  asset_id: string;
  role: string;
  url: string;
  mime_type: string;
  size_bytes: number;
};

// A model may be priced twice: once in the gateway's base currency and once in
// the alternate currency. The `alt_` fields are integer minor units of the
// alternate currency, and 0 means unset — the gateway then prices that model in
// the alternate currency by converting the base price at the configured rate.
export type ModelBilling = {
  mode: 'free' | 'per_request' | 'per_output_second';
  currency: string;
  unit_price: number;
  unit_scale: number;
  minimum_charge: number;
  alt_unit_price?: number;
  alt_minimum_charge?: number;
  rates: ModelBillingRate[];
};

export type ModelBillingRate = {
  label: string;
  dimensions: Record<string, string>;
  unit_price: number;
  unit_scale: number;
  minimum_charge: number;
  alt_unit_price?: number;
  alt_minimum_charge?: number;
};

export type PublicModel = {
  id: string;
  object: 'model';
  display_name: string;
  modality: 'image' | 'video';
  operations: string[];
  provider: string;
  parameters: Record<string, unknown>;
  request_form?: RequestForm;
  billing: ModelBilling;
};

export type AdminModel = PublicModel & {
  upstream_model: string;
  endpoint?: string;
  status: 'active' | 'inactive';
  protocol_profile?: unknown;
  profile_customized: boolean;
  bindings: ModelBinding[];
  api_key_configured: boolean;
  created_at: string;
  updated_at: string;
};

export type FormParameter = {
  name: string;
  pointer: string;
  type: 'string' | 'integer' | 'boolean';
  required?: boolean;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
};

export type FormMedia = {
  type: string;
  field: string;
  url_field: string;
  mime_prefix: string;
  roles?: string[];
  default_role?: string;
};

export type FormContent = {
  pointer: string;
  text_type: string;
  text_field: string;
  media?: FormMedia[];
};

export type FormInput = {
  pointer: string;
  name: string;
  mime_prefix: string;
  array?: boolean;
};

// RequestForm describes how to build this model's own native request. It is
// derived from the protocol profile the administrator stored.
export type RequestForm = {
  method: string;
  path: string;
  model: string;
  prompt: { pointer?: string; max_runes?: number; content?: FormContent };
  inputs?: FormInput[];
  parameters?: FormParameter[];
};

export type ModelBinding = {
  alias: string;
  endpoint: string;
  status: 'active' | 'inactive';
  weight: number;
  api_key_configured: boolean;
};

export type ProtocolPreset = {
  name: string;
  display_name: string;
  model_id: string;
  upstream_model: string;
  endpoint: string;
  modality: string;
  profile: unknown;
};

export type Asset = {
  id: string;
  url?: string;
  mime_type: string;
  sha256: string;
  size_bytes: number;
};

export type Artifact = {
  id: string;
  generation_id: string;
  role: string;
  url: string;
  mime_type: string;
  sha256: string;
  size_bytes: number;
  width?: number;
  height?: number;
  duration_ms?: number;
  created_at: string;
};

export type ProviderIO = {
  id: string;
  generation_id: string;
  attempt_id: string;
  phase: string;
  request: unknown;
  response?: unknown;
  http_status?: number;
  occurred_at: string;
};

export type AdminOverview = {
  tenant_count: number;
  active_tenant_count: number;
  user_count: number;
  generation_count: number;
  queued_count: number;
  failed_count: number;
};

export type AssetStorage = {
  object: 'asset_storage';
  backend: 'local' | 's3';
  local_path: string;
  max_bytes: number;
  cdn_base_url?: string;
  s3_endpoint?: string;
  s3_region?: string;
  s3_bucket?: string;
  s3_access_key_configured: boolean;
  s3_secret_key_configured: boolean;
  updated_at: string;
};

export type AdminTenant = Tenant & {
  member_count: number;
  generation_count: number;
  last_activity_at?: string;
};

export type AdminUser = User & {
  object: 'user';
  email_verified_at?: string;
  tenant: Tenant;
  role: string;
  member_count: number;
  generation_count: number;
  api_key_count: number;
  balance?: Balance;
  last_activity_at?: string;
  last_seen_at?: string;
};

// The offer already arrives in the workspace's billing currency: `amounts`,
// `min_amount` and `max_amount` are minor units of `currency` and are shown as
// they are. `rate` and `base_currency` are carried only for explanation.
export type TopupOptions = {
  object: 'topup_options';
  enabled: boolean;
  currency: string;
  amounts: number[];
  custom_amount: boolean;
  min_amount: number;
  max_amount: number;
  base_currency?: string;
  rate?: number;
};

export type TopupStatus = 'pending' | 'paid' | 'expired' | 'canceled';

export type Topup = {
  object: 'topup';
  id: string;
  amount: number;
  currency: string;
  status: TopupStatus;
  credited: boolean;
  checkout_url?: string;
  created_at: string;
  completed_at?: string;
  // The gateway issues an invoice once the payment settles, so both fields are
  // absent on an order that has not been paid.
  invoice_number?: string;
  invoice_url?: string;
  balance?: Balance;
};

// The admin list at `GET /v1/admin/billing/topups` carries the payer alongside
// the order, which the per-user history does not need.
export type AdminTopup = Topup & {
  tenant_id?: string;
  user_id: string;
  email?: string;
};

export type AdminTopupList = {
  object: 'list';
  total: number;
  data: AdminTopup[];
};

export type TopupConfig = {
  object: 'topup_config';
  enabled: boolean;
  currency: string;
  amounts: number[];
  custom_amount: boolean;
  min_amount: number;
  max_amount: number;
  // The Stripe payment methods offered for a base-currency payment. Empty
  // means whatever the Stripe Dashboard has enabled for that currency.
  payment_methods?: string[];
  // The offer for a workspace billed in the alternate currency. An empty
  // `alt_currency` turns it off, and the other alt fields are then ignored.
  alt_currency?: string;
  alt_amounts?: number[];
  alt_min_amount?: number;
  alt_max_amount?: number;
  alt_rate?: number;
  alt_payment_methods?: string[];
  stripe_configured: boolean;
  webhook_configured: boolean;
  updated_at?: string;
};
