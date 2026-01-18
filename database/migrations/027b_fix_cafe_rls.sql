-- Fix for infinite recursion in cafe_memberships RLS policies
-- Run this AFTER the main migration if you get the recursion error

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view memberships in their cafes" ON cafe_memberships;
DROP POLICY IF EXISTS "Users can join open cafes" ON cafe_memberships;

-- Create a security definer function to check cafe membership without triggering RLS
CREATE OR REPLACE FUNCTION user_is_cafe_member(p_cafe_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM cafe_memberships
        WHERE cafe_id = p_cafe_id
        AND user_id = p_user_id
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users can view their own memberships
CREATE POLICY "Users can view their own memberships"
    ON cafe_memberships FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can view other memberships in cafes they belong to
-- Uses security definer function to avoid recursion
CREATE POLICY "Users can view memberships in shared cafes"
    ON cafe_memberships FOR SELECT
    TO authenticated
    USING (
        user_is_cafe_member(cafe_id, auth.uid())
    );

-- Users can join open cafes (simplified - no self-reference)
CREATE POLICY "Users can join open cafes"
    ON cafe_memberships FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM cafes c
            WHERE c.id = cafe_id
            AND c.is_open = true
            AND c.member_count < c.max_members
        )
    );

-- Grant execute on the helper function
GRANT EXECUTE ON FUNCTION user_is_cafe_member TO authenticated;
