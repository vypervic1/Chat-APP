-- ==========================================
-- VyperVic Android Push Notification Triggers
-- ==========================================
-- This file configures the Supabase PostgreSQL database to automatically 
-- detect new private messages and group chat mentions, then fire notifications.

-- 1. Create table to store FCM Push Tokens registered from Android devices
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL UNIQUE,
    device_name TEXT DEFAULT 'Android Device',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for user_push_tokens
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own push tokens
CREATE POLICY "Users can manage their own push tokens" 
ON public.user_push_tokens 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Create table to log triggered push notification deliveries for tracing & live simulation
CREATE TABLE IF NOT EXISTS public.triggered_pushes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('dm_message', 'mention')),
    status TEXT NOT NULL DEFAULT 'delivered', -- 'delivered', 'failed', 'pending'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for triggered_pushes
ALTER TABLE public.triggered_pushes ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own triggered pushes
CREATE POLICY "Users can read their own triggered push notifications"
ON public.triggered_pushes
FOR SELECT
USING (auth.uid() = user_id);


-- 3. Trigger Function: Detect new messages & calculate notifications
CREATE OR REPLACE FUNCTION public.notify_push_on_message()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient_id UUID;
    v_sender_username TEXT;
    v_sender_display TEXT;
    v_notification_title TEXT;
    v_notification_body TEXT;
    v_mentioned_username TEXT;
    v_mention_profile_id UUID;
    v_token_count INT;
BEGIN
    -- Get sender details
    SELECT username, display_name 
    INTO v_sender_username, v_sender_display 
    FROM public.profiles 
    WHERE id = NEW.sender_id;

    -- Format display sender name
    IF v_sender_display IS NULL OR v_sender_display = '' THEN
        v_sender_display := COALESCE(v_sender_username, 'Someone');
    END IF;

    -- A. CASE 1: Private Direct Message (chat_id starts with 'dm:')
    -- Direct message chat_id format is 'dm:user_id_1:user_id_2' (sorted UUIDs)
    IF NEW.chat_id LIKE 'dm:%' THEN
        -- Extract the two UUIDs from the DM chat_id
        -- e.g., dm:UUID1:UUID2
        DECLARE
            v_part1 TEXT;
            v_part2 TEXT;
        BEGIN
            v_part1 := split_part(NEW.chat_id, ':', 2);
            v_part2 := split_part(NEW.chat_id, ':', 3);
            
            -- Recipient is the one who is NOT the sender
            IF v_part1 = NEW.sender_id::text THEN
                v_recipient_id := v_part2::UUID;
            ELSE
                v_recipient_id := v_part1::UUID;
            END IF;
        END;

        -- Create notification text
        v_notification_title := 'New message from ' || v_sender_display;
        v_notification_body := COALESCE(NEW.text, 'Sent an attachment 📎');
        
        -- If voice message
        IF NEW.is_voice THEN
            v_notification_body := '🎤 Sent a voice note';
        END IF;

        -- Check if recipient has registered push tokens
        SELECT count(*) INTO v_token_count 
        FROM public.user_push_tokens 
        WHERE user_id = v_recipient_id AND is_active = TRUE;

        -- Insert into triggered pushes for client-side subscription/sync
        INSERT INTO public.triggered_pushes (user_id, message_id, title, body, type, status)
        VALUES (
            v_recipient_id, 
            NEW.id, 
            v_notification_title, 
            v_notification_body, 
            'dm_message',
            CASE WHEN v_token_count > 0 THEN 'delivered' ELSE 'pending' END
        );

        -- HTTP Callout: Here we would dispatch to FCM endpoint (or Supabase Edge Function)
        -- PERFORM net.http_post(
        --     'https://your-project.supabase.co/functions/v1/send-push-notification',
        --     json_build_object('user_id', v_recipient_id, 'title', v_notification_title, 'body', v_notification_body)::text,
        --     '{}',
        --     '{"Content-Type": "application/json"}'
        -- );

    -- B. CASE 2: Community Channel Message Mentions (chat_id = 'general')
    ELSIF NEW.chat_id = 'general' AND NEW.text IS NOT NULL THEN
        -- Parse mentions of the format @username (e.g. '@vic')
        -- Find match in text using regex
        FOR v_mentioned_username IN 
            SELECT regexp_matches(NEW.text, '@([a-zA-Z0-9_]{3,30})', 'g')
        LOOP
            -- Get the profile id for this mentioned username
            SELECT id INTO v_mention_profile_id 
            FROM public.profiles 
            WHERE lower(username) = lower(v_mentioned_username);

            -- If valid profile exists and it is not the sender themselves
            IF v_mention_profile_id IS NOT NULL AND v_mention_profile_id != NEW.sender_id THEN
                v_notification_title := v_sender_display || ' mentioned you in General';
                v_notification_body := NEW.text;

                SELECT count(*) INTO v_token_count 
                FROM public.user_push_tokens 
                WHERE user_id = v_mention_profile_id AND is_active = TRUE;

                INSERT INTO public.triggered_pushes (user_id, message_id, title, body, type, status)
                VALUES (
                    v_mention_profile_id, 
                    NEW.id, 
                    v_notification_title, 
                    v_notification_body, 
                    'mention',
                    CASE WHEN v_token_count > 0 THEN 'delivered' ELSE 'pending' END
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create trigger on messages table
DROP TRIGGER IF EXISTS on_message_created_push_trigger ON public.messages;
CREATE TRIGGER on_message_created_push_trigger
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_push_on_message();
