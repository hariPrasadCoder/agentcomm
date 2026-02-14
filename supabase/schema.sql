-- AgentComm Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============ Organizations ============

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    invite_code VARCHAR(64) UNIQUE NOT NULL,
    owner_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Users ============

CREATE TABLE users (
    id UUID PRIMARY KEY,  -- Links to Supabase auth.users
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    avatar_url TEXT,
    org_id UUID REFERENCES organizations(id),
    team_id UUID,
    expertise TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key after users table exists
ALTER TABLE organizations ADD FOREIGN KEY (owner_id) REFERENCES users(id);

-- ============ Teams ============

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, name)
);

ALTER TABLE users ADD FOREIGN KEY (team_id) REFERENCES teams(id);

-- ============ Channels ============

CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    channel_type VARCHAR(20) NOT NULL DEFAULT 'public',  -- public, private, dm
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, name)
);

CREATE INDEX idx_channels_org ON channels(org_id);

-- ============ Channel Members ============

CREATE TABLE channel_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

CREATE INDEX idx_channel_members_user ON channel_members(user_id);
CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);

-- ============ DM Conversations ============

CREATE TABLE dm_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    participant_ids UUID[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dm_participants ON dm_conversations USING GIN (participant_ids);

-- ============ Messages ============

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    dm_conversation_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',  -- text, request, response, follow_up, system, agent
    is_from_agent BOOLEAN DEFAULT FALSE,
    parent_id UUID REFERENCES messages(id),  -- For threads
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CHECK (channel_id IS NOT NULL OR dm_conversation_id IS NOT NULL)
);

CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_dm ON messages(dm_conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- ============ Requests (AI-routed tasks) ============

CREATE TABLE requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES users(id),
    to_user_id UUID REFERENCES users(id),
    to_team_id UUID REFERENCES teams(id),
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, in_progress, waiting_response, completed, cancelled
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',  -- low, normal, high, urgent
    due_date TIMESTAMPTZ,
    follow_up_count INTEGER DEFAULT 0,
    last_follow_up TIMESTAMPTZ,
    response TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_requests_from ON requests(from_user_id, created_at DESC);
CREATE INDEX idx_requests_to ON requests(to_user_id, created_at DESC);
CREATE INDEX idx_requests_status ON requests(status);

-- ============ Tasks (User's queue) ============

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_user ON tasks(user_id, status);

-- ============ Notifications ============

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ============ User Presence ============

CREATE TABLE user_presence (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'offline',  -- online, away, dnd, offline
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Row Level Security (RLS) ============

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Users can read users in their org
CREATE POLICY "Users can view org members" ON users
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
        OR id = auth.uid()
    );

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (id = auth.uid());

-- Organizations visible to members
CREATE POLICY "Org visible to members" ON organizations
    FOR SELECT USING (
        id IN (SELECT org_id FROM users WHERE id = auth.uid())
    );

-- Channels visible to members
CREATE POLICY "Channels visible to members" ON channels
    FOR SELECT USING (
        id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
    );

-- Messages visible based on channel/DM membership
CREATE POLICY "Messages visible to participants" ON messages
    FOR SELECT USING (
        (channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid()))
        OR
        (dm_conversation_id IN (SELECT id FROM dm_conversations WHERE auth.uid() = ANY(participant_ids)))
    );

-- Requests visible to sender or recipient
CREATE POLICY "Requests visible to participants" ON requests
    FOR SELECT USING (
        from_user_id = auth.uid() OR to_user_id = auth.uid()
    );

-- Tasks visible to owner
CREATE POLICY "Tasks visible to owner" ON tasks
    FOR SELECT USING (user_id = auth.uid());

-- Notifications visible to owner
CREATE POLICY "Notifications visible to owner" ON notifications
    FOR SELECT USING (user_id = auth.uid());

-- ============ Realtime ============

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============ Functions ============

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for messages
CREATE TRIGGER messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
