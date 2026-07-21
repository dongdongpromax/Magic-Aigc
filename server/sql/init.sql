CREATE TABLE IF NOT EXISTS app_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  base_url VARCHAR(255) NOT NULL,
  default_model VARCHAR(120) NOT NULL,
  default_size VARCHAR(60) NOT NULL,
  default_quality VARCHAR(40) NOT NULL,
  default_n INT NOT NULL,
  request_mode VARCHAR(60) NOT NULL,
  timeout INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  cover_image_path VARCHAR(255) NULL,
  last_prompt TEXT NULL,
  message_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  updated_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  topic_id VARCHAR(64) NOT NULL,
  type VARCHAR(40) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NULL,
  prompt TEXT NULL,
  revised_prompt TEXT NULL,
  model VARCHAR(120) NULL,
  size VARCHAR(60) NULL,
  quality VARCHAR(40) NULL,
  n INT NULL,
  status VARCHAR(20) NULL,
  source_message_id VARCHAR(64) NULL,
  meta_json JSON NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_messages_topic_created (topic_id, created_at)
);

CREATE TABLE IF NOT EXISTS drafts (
  topic_id VARCHAR(64) PRIMARY KEY,
  prompt TEXT NULL,
  model VARCHAR(120) NOT NULL,
  size VARCHAR(60) NOT NULL,
  quality VARCHAR(40) NOT NULL,
  n INT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS draft_reference_images (
  id VARCHAR(64) PRIMARY KEY,
  topic_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  source_message_id VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  INDEX idx_reference_topic_order (topic_id, sort_order)
);

CREATE TABLE IF NOT EXISTS message_images (
  id VARCHAR(64) PRIMARY KEY,
  message_id VARCHAR(64) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  width INT NULL,
  height INT NULL,
  saved_to_project TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  INDEX idx_message_images_message (message_id)
);

ALTER TABLE app_settings ADD COLUMN default_provider_id VARCHAR(64) NULL;

CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  base_url VARCHAR(255) NOT NULL,
  api_keys JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  request_mode VARCHAR(60) NOT NULL DEFAULT 'openrouter-image',
  color VARCHAR(20) NULL,
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_models (
  id VARCHAR(64) PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  model_id VARCHAR(190) NOT NULL,
  display_name VARCHAR(255) NULL,
  group_name VARCHAR(120) NULL,
  is_image TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  UNIQUE KEY uq_provider_model (provider_id, model_id)
);

ALTER TABLE drafts ADD COLUMN provider_id VARCHAR(64) NULL;
