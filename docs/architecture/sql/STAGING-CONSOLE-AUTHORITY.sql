-- Staging only. Requires reviewed existing Business OS auth.users/auth.sessions and
-- public.business_memberships/businesses. App roles never receive direct access to those tables.
-- Apply only to an explicitly authorized synthetic staging database, as migration owner.
CREATE TABLE cigo.staging_access (
 actor_id uuid NOT NULL, workspace_id uuid NOT NULL, label text NOT NULL CHECK(length(label)<=80),
 active boolean NOT NULL DEFAULT false, revoked boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL, version uuid NOT NULL DEFAULT gen_random_uuid(),
 PRIMARY KEY(actor_id,workspace_id)
);
CREATE TABLE cigo.staging_login_windows (email_digest text PRIMARY KEY, started_at timestamptz NOT NULL, attempts integer NOT NULL);
ALTER TABLE cigo.staging_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.staging_access FORCE ROW LEVEL SECURITY;
ALTER TABLE cigo.staging_login_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.staging_login_windows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON cigo.staging_access,cigo.staging_login_windows FROM PUBLIC;

-- Narrow privileged projection, not a browser RPC. EXECUTE granted only to a dedicated
-- non-inheriting server login. JWT identity is provider-verified before calling this function.
CREATE FUNCTION cigo.staging_membership(actor uuid,sid uuid,workspace uuid)
RETURNS TABLE(active boolean,revoked boolean,role text,version text,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
 SELECT a.active,a.revoked,CASE m.role::text WHEN 'owner' THEN 'OWNER' WHEN 'admin' THEN 'ADMIN' WHEN 'viewer' THEN 'VIEWER' ELSE 'MEMBER' END,
 a.version::text||':'||m.updated_at::text||':'||b.updated_at::text,
 LEAST(a.expires_at,COALESCE(s.not_after,a.expires_at),s.created_at+interval '30 minutes')
 FROM cigo.staging_access a JOIN auth.sessions s ON s.user_id=a.actor_id AND s.id=sid
 JOIN public.business_memberships m ON m.user_id=a.actor_id AND m.business_id=a.workspace_id
 JOIN public.businesses b ON b.id=a.workspace_id
 WHERE a.actor_id=actor AND a.workspace_id=workspace AND a.active AND NOT a.revoked
 AND a.expires_at>now() AND (s.not_after IS NULL OR s.not_after>now())
 AND s.created_at+interval '30 minutes'>now() AND m.status::text='active' AND b.status::text='active'
$$;
CREATE FUNCTION cigo.staging_workspaces(actor uuid,sid uuid)
RETURNS TABLE(workspace_id uuid,label text) LANGUAGE sql SECURITY DEFINER STABLE SET search_path=pg_catalog AS $$
 SELECT a.workspace_id,a.label FROM cigo.staging_access a
 CROSS JOIN LATERAL cigo.staging_membership(actor,sid,a.workspace_id) m
 WHERE a.actor_id=actor AND m.active AND NOT m.revoked AND m.expires_at>now() AND m.role IN ('OWNER','ADMIN','VIEWER')
 ORDER BY a.workspace_id LIMIT 2
$$;
CREATE FUNCTION cigo.staging_login_allowed(email text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE matched boolean; count_attempts integer;
BEGIN
 SELECT EXISTS(SELECT 1 FROM auth.users u JOIN cigo.staging_access a ON a.actor_id=u.id
 WHERE lower(u.email)=lower($1) AND a.active AND NOT a.revoked AND a.expires_at>now()) INTO matched;
 IF NOT matched THEN RETURN false; END IF;
 INSERT INTO cigo.staging_login_windows(email_digest,started_at,attempts)
 VALUES(md5(lower($1)),now(),1) ON CONFLICT(email_digest) DO UPDATE
 SET started_at=CASE WHEN cigo.staging_login_windows.started_at<now()-interval '10 minutes' THEN now() ELSE cigo.staging_login_windows.started_at END,
 attempts=CASE WHEN cigo.staging_login_windows.started_at<now()-interval '10 minutes' THEN 1 ELSE cigo.staging_login_windows.attempts+1 END
 RETURNING attempts INTO count_attempts;
 RETURN count_attempts<=10;
END $$;
REVOKE ALL ON FUNCTION cigo.staging_membership(uuid,uuid,uuid),cigo.staging_workspaces(uuid,uuid),cigo.staging_login_allowed(text) FROM PUBLIC;
-- Owner provisions a dedicated server login with EXECUTE on these three functions only;
-- tenant issuer logins get SELECT/INSERT on immutable cigo evidence/receipts and SELECT
-- revocations with forced RLS policies fixed to one synthetic workspace per login.
-- No anon/authenticated EXECUTE; no service_role or owner login in the application.
