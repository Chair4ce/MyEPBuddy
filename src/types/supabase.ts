export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accomplishments: {
        Row: {
          action_verb: string
          created_at: string
          created_by: string
          cycle_year: number
          date: string
          details: string
          id: string
          impact: string
          metrics: string | null
          mpa: string
          tags: Json | null
          team_member_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_verb: string
          created_at?: string
          created_by: string
          cycle_year?: number
          date?: string
          details: string
          id?: string
          impact: string
          metrics?: string | null
          mpa: string
          tags?: Json | null
          team_member_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_verb?: string
          created_at?: string
          created_by?: string
          cycle_year?: number
          date?: string
          details?: string
          id?: string
          impact?: string
          metrics?: string | null
          mpa?: string
          tags?: Json | null
          team_member_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accomplishments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accomplishments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accomplishments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_statements: {
        Row: {
          afsc: string
          contributor_id: string
          created_at: string
          downvotes: number | null
          id: string
          is_approved: boolean
          mpa: string
          rank: Database["public"]["Enums"]["user_rank"]
          refined_statement_id: string | null
          statement: string
          upvotes: number
        }
        Insert: {
          afsc: string
          contributor_id: string
          created_at?: string
          downvotes?: number | null
          id?: string
          is_approved?: boolean
          mpa: string
          rank: Database["public"]["Enums"]["user_rank"]
          refined_statement_id?: string | null
          statement: string
          upvotes?: number
        }
        Update: {
          afsc?: string
          contributor_id?: string
          created_at?: string
          downvotes?: number | null
          id?: string
          is_approved?: boolean
          mpa?: string
          rank?: Database["public"]["Enums"]["user_rank"]
          refined_statement_id?: string | null
          statement?: string
          upvotes?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_statements_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_statements_refined_statement_id_fkey"
            columns: ["refined_statement_id"]
            isOneToOne: false
            referencedRelation: "refined_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_statements_refined_statement_id_fkey"
            columns: ["refined_statement_id"]
            isOneToOne: false
            referencedRelation: "shared_statements_view"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_config: {
        Row: {
          base_system_prompt: string
          current_cycle_year: number
          id: number
          major_graded_areas: Json
          max_characters_per_statement: number
          rank_verb_progression: Json
          scod_date: string
          style_guidelines: string
          updated_at: string
        }
        Insert: {
          base_system_prompt?: string
          current_cycle_year?: number
          id?: number
          major_graded_areas?: Json
          max_characters_per_statement?: number
          rank_verb_progression?: Json
          scod_date?: string
          style_guidelines?: string
          updated_at?: string
        }
        Update: {
          base_system_prompt?: string
          current_cycle_year?: number
          id?: number
          major_graded_areas?: Json
          max_characters_per_statement?: number
          rank_verb_progression?: Json
          scod_date?: string
          style_guidelines?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_managed_links: {
        Row: {
          created_at: string | null
          data_synced: boolean | null
          id: string
          responded_at: string | null
          status: string
          supervisor_accepted: boolean | null
          team_member_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_synced?: boolean | null
          id?: string
          responded_at?: string | null
          status?: string
          supervisor_accepted?: boolean | null
          team_member_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_synced?: boolean | null
          id?: string
          responded_at?: string | null
          status?: string
          supervisor_accepted?: boolean | null
          team_member_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_managed_links_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_prior_data_review: {
        Row: {
          created_at: string | null
          entry_count: number | null
          id: string
          prior_team_member_id: string
          resolved_at: string | null
          statement_count: number | null
          status: string | null
          subordinate_id: string
          supervisor_id: string
        }
        Insert: {
          created_at?: string | null
          entry_count?: number | null
          id?: string
          prior_team_member_id: string
          resolved_at?: string | null
          statement_count?: number | null
          status?: string | null
          subordinate_id: string
          supervisor_id: string
        }
        Update: {
          created_at?: string | null
          entry_count?: number | null
          id?: string
          prior_team_member_id?: string
          resolved_at?: string | null
          statement_count?: number | null
          status?: string | null
          subordinate_id?: string
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_prior_data_review_prior_team_member_id_fkey"
            columns: ["prior_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_prior_data_review_subordinate_id_fkey"
            columns: ["subordinate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_prior_data_review_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          afsc: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          rank: Database["public"]["Enums"]["user_rank"] | null
          role: Database["public"]["Enums"]["user_role"]
          supervisor_id: string | null
          terms_accepted_at: string | null
          unit: string | null
          updated_at: string
          writing_style: string
        }
        Insert: {
          afsc?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          rank?: Database["public"]["Enums"]["user_rank"] | null
          role?: Database["public"]["Enums"]["user_role"]
          supervisor_id?: string | null
          terms_accepted_at?: string | null
          unit?: string | null
          updated_at?: string
          writing_style?: string
        }
        Update: {
          afsc?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          rank?: Database["public"]["Enums"]["user_rank"] | null
          role?: Database["public"]["Enums"]["user_role"]
          supervisor_id?: string | null
          terms_accepted_at?: string | null
          unit?: string | null
          updated_at?: string
          writing_style?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refined_statements: {
        Row: {
          afsc: string
          created_at: string
          created_by: string | null
          cycle_year: number
          history_id: string | null
          id: string
          is_favorite: boolean
          mpa: string
          rank: Database["public"]["Enums"]["user_rank"]
          statement: string
          statement_type: string
          source_accomplishment_ids: string[] | null
          team_member_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          afsc: string
          created_at?: string
          created_by?: string | null
          cycle_year: number
          history_id?: string | null
          id?: string
          is_favorite?: boolean
          mpa: string
          rank: Database["public"]["Enums"]["user_rank"]
          statement: string
          statement_type?: string
          source_accomplishment_ids?: string[] | null
          team_member_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          afsc?: string
          created_at?: string
          created_by?: string | null
          cycle_year?: number
          history_id?: string | null
          id?: string
          is_favorite?: boolean
          mpa?: string
          rank?: Database["public"]["Enums"]["user_rank"]
          statement?: string
          statement_type?: string
          source_accomplishment_ids?: string[] | null
          team_member_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refined_statements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refined_statements_history_id_fkey"
            columns: ["history_id"]
            isOneToOne: false
            referencedRelation: "statement_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refined_statements_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refined_statements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_history: {
        Row: {
          afsc: string
          created_at: string
          cycle_year: number
          id: string
          model_used: string
          mpa: string
          original_statement: string
          rank: Database["public"]["Enums"]["user_rank"]
          ratee_id: string
          team_member_id: string | null
          user_id: string
        }
        Insert: {
          afsc: string
          created_at?: string
          cycle_year: number
          id?: string
          model_used: string
          mpa: string
          original_statement: string
          rank: Database["public"]["Enums"]["user_rank"]
          ratee_id: string
          team_member_id?: string | null
          user_id: string
        }
        Update: {
          afsc?: string
          created_at?: string
          cycle_year?: number
          id?: string
          model_used?: string
          mpa?: string
          original_statement?: string
          rank?: Database["public"]["Enums"]["user_rank"]
          ratee_id?: string
          team_member_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_history_ratee_id_fkey"
            columns: ["ratee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_history_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_shares: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          share_type: string
          shared_with_id: string | null
          statement_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          share_type: string
          shared_with_id?: string | null
          statement_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          share_type?: string
          shared_with_id?: string | null
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_shares_shared_with_id_fkey"
            columns: ["shared_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_shares_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "refined_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_shares_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "shared_statements_view"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_votes: {
        Row: {
          created_at: string | null
          id: string
          statement_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          statement_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          statement_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_votes_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "community_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      team_history: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          started_at: string
          subordinate_id: string
          supervisor_id: string
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          subordinate_id: string
          supervisor_id: string
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          subordinate_id?: string
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_history_subordinate_id_fkey"
            columns: ["subordinate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_history_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          afsc: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_placeholder: boolean
          linked_user_id: string | null
          member_status: string | null
          original_profile_id: string | null
          parent_profile_id: string | null
          parent_team_member_id: string | null
          rank: Database["public"]["Enums"]["user_rank"] | null
          supervisor_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          afsc?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_placeholder?: boolean
          linked_user_id?: string | null
          member_status?: string | null
          original_profile_id?: string | null
          parent_profile_id?: string | null
          parent_team_member_id?: string | null
          rank?: Database["public"]["Enums"]["user_rank"] | null
          supervisor_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          afsc?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_placeholder?: boolean
          linked_user_id?: string | null
          member_status?: string | null
          original_profile_id?: string | null
          parent_profile_id?: string | null
          parent_team_member_id?: string | null
          rank?: Database["public"]["Enums"]["user_rank"] | null
          supervisor_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_linked_user_id_fkey"
            columns: ["linked_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_original_profile_id_fkey"
            columns: ["original_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_parent_profile_id_fkey"
            columns: ["parent_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_parent_team_member_id_fkey"
            columns: ["parent_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          request_type: string
          requester_id: string
          responded_at: string | null
          status: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          request_type: string
          requester_id: string
          responded_at?: string | null
          status?: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          request_type?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          subordinate_id: string
          supervisor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subordinate_id: string
          supervisor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subordinate_id?: string
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_subordinate_id_fkey"
            columns: ["subordinate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          anthropic_key: string | null
          created_at: string
          google_key: string | null
          grok_key: string | null
          id: string
          openai_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anthropic_key?: string | null
          created_at?: string
          google_key?: string | null
          grok_key?: string | null
          id?: string
          openai_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anthropic_key?: string | null
          created_at?: string
          google_key?: string | null
          grok_key?: string | null
          id?: string
          openai_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          id: string
          user_id: string | null
          feature: string
          feedback: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          feature: string
          feedback: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          feature?: string
          feedback?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_llm_settings: {
        Row: {
          abbreviations: Json
          acronyms: Json
          base_system_prompt: string
          created_at: string
          current_cycle_year: number
          id: string
          major_graded_areas: Json
          max_characters_per_statement: number
          max_example_statements: number
          rank_verb_progression: Json
          scod_date: string
          style_guidelines: string
          updated_at: string
          user_id: string
        }
        Insert: {
          abbreviations?: Json
          acronyms?: Json
          base_system_prompt?: string
          created_at?: string
          current_cycle_year?: number
          id?: string
          major_graded_areas?: Json
          max_characters_per_statement?: number
          max_example_statements?: number
          rank_verb_progression?: Json
          scod_date?: string
          style_guidelines?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          abbreviations?: Json
          acronyms?: Json
          base_system_prompt?: string
          created_at?: string
          current_cycle_year?: number
          id?: string
          major_graded_areas?: Json
          max_characters_per_statement?: number
          max_example_statements?: number
          rank_verb_progression?: Json
          scod_date?: string
          style_guidelines?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_llm_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_session_participants: {
        Row: {
          id: string
          is_host: boolean | null
          joined_at: string | null
          left_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_host?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_host?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workspace_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_session_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          host_user_id: string
          id: string
          is_active: boolean | null
          session_code: string
          updated_at: string | null
          workspace_state: Json | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          host_user_id: string
          id?: string
          is_active?: boolean | null
          session_code: string
          updated_at?: string | null
          workspace_state?: Json | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          host_user_id?: string
          id?: string
          is_active?: boolean | null
          session_code?: string
          updated_at?: string | null
          workspace_state?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      shared_statements_view: {
        Row: {
          afsc: string | null
          created_at: string | null
          cycle_year: number | null
          id: string | null
          is_favorite: boolean | null
          mpa: string | null
          owner_id: string | null
          owner_name: string | null
          owner_rank: Database["public"]["Enums"]["user_rank"] | null
          rank: Database["public"]["Enums"]["user_rank"] | null
          share_id: string | null
          share_type: string | null
          shared_with_id: string | null
          statement: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refined_statements_user_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_shares_shared_with_id_fkey"
            columns: ["shared_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_pending_managed_link: { Args: { link_id: string }; Returns: Json }
      accept_prior_data_review: { Args: { p_review_id: string }; Returns: Json }
      accept_supervisor_from_link: { Args: { link_id: string }; Returns: Json }
      archive_prior_subordinate: {
        Args: { team_member_id: string }
        Returns: Json
      }
      can_supervise: {
        Args: { rank_value: Database["public"]["Enums"]["user_rank"] }
        Returns: boolean
      }
      complete_pending_link: { Args: { link_id: string }; Returns: Json }
      delete_prior_subordinate: {
        Args: { p_delete_data?: boolean; p_team_member_id: string }
        Returns: Json
      }
      dismiss_pending_link: { Args: { link_id: string }; Returns: Json }
      generate_session_code: { Args: never; Returns: string }
      get_all_managed_members: {
        Args: { supervisor_uuid: string }
        Returns: {
          afsc: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_placeholder: boolean
          linked_user_id: string
          parent_profile_id: string
          parent_team_member_id: string
          rank: Database["public"]["Enums"]["user_rank"]
          supervisor_id: string
          unit: string
          updated_at: string
        }[]
      }
      get_chain_managed_members: {
        Args: { supervisor_uuid: string }
        Returns: {
          afsc: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_placeholder: boolean
          linked_user_id: string
          parent_profile_id: string
          rank: Database["public"]["Enums"]["user_rank"]
          supervisor_id: string
          unit: string
          updated_at: string
        }[]
      }
      get_subordinate_chain: {
        Args: { supervisor_uuid: string }
        Returns: {
          depth: number
          subordinate_id: string
        }[]
      }
      get_supervisor_chain: {
        Args: { subordinate_uuid: string }
        Returns: {
          depth: number
          supervisor_id: string
        }[]
      }
      reject_prior_data_review: { Args: { p_review_id: string }; Returns: Json }
      sync_managed_account_data: { Args: { link_id: string }; Returns: Json }
    }
    Enums: {
      user_rank:
        | "AB"
        | "Amn"
        | "A1C"
        | "SrA"
        | "SSgt"
        | "TSgt"
        | "MSgt"
        | "SMSgt"
        | "CMSgt"
      user_role: "supervisor" | "subordinate" | "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      user_rank: [
        "AB",
        "Amn",
        "A1C",
        "SrA",
        "SSgt",
        "TSgt",
        "MSgt",
        "SMSgt",
        "CMSgt",
      ],
      user_role: ["supervisor", "subordinate", "admin", "member"],
    },
  },
} as const

