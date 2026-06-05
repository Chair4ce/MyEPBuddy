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
      accomplishment_comments: {
        Row: {
          accomplishment_id: string
          author_id: string
          comment_text: string
          created_at: string | null
          id: string
          is_resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string | null
          visible_to: string[] | null
        }
        Insert: {
          accomplishment_id: string
          author_id: string
          comment_text: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
          visible_to?: string[] | null
        }
        Update: {
          accomplishment_id?: string
          author_id?: string
          comment_text?: string
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
          visible_to?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "accomplishment_comments_accomplishment_id_fkey"
            columns: ["accomplishment_id"]
            isOneToOne: false
            referencedRelation: "accomplishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accomplishment_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accomplishment_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accomplishment_projects: {
        Row: {
          accomplishment_id: string
          created_at: string
          id: string
          project_id: string
        }
        Insert: {
          accomplishment_id: string
          created_at?: string
          id?: string
          project_id: string
        }
        Update: {
          accomplishment_id?: string
          created_at?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accomplishment_projects_accomplishment_id_fkey"
            columns: ["accomplishment_id"]
            isOneToOne: false
            referencedRelation: "accomplishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accomplishment_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      accomplishments: {
        Row: {
          action_verb: string
          assessed_at: string | null
          assessment_model: string | null
          assessment_scores: Json | null
          created_at: string
          created_by: string
          cycle_year: number
          date: string
          details: string
          id: string
          impact: string | null
          metrics: string | null
          mpa: string
          tags: Json | null
          team_member_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_verb: string
          assessed_at?: string | null
          assessment_model?: string | null
          assessment_scores?: Json | null
          created_at?: string
          created_by: string
          cycle_year?: number
          date?: string
          details: string
          id?: string
          impact?: string | null
          metrics?: string | null
          mpa: string
          tags?: Json | null
          team_member_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_verb?: string
          assessed_at?: string | null
          assessment_model?: string | null
          assessment_scores?: Json | null
          created_at?: string
          created_by?: string
          cycle_year?: number
          date?: string
          details?: string
          id?: string
          impact?: string | null
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
      award_catalog: {
        Row: {
          award_type: Database["public"]["Enums"]["award_type"]
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_team_eligible: boolean | null
          name: string
          short_name: string | null
        }
        Insert: {
          award_type: Database["public"]["Enums"]["award_type"]
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_team_eligible?: boolean | null
          name: string
          short_name?: string | null
        }
        Update: {
          award_type?: Database["public"]["Enums"]["award_type"]
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_team_eligible?: boolean | null
          name?: string
          short_name?: string | null
        }
        Relationships: []
      }
      award_request_team_members: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string | null
          request_id: string
          team_member_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id?: string | null
          request_id: string
          team_member_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string | null
          request_id?: string
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "award_request_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_request_team_members_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "award_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_request_team_members_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      award_requests: {
        Row: {
          approver_id: string
          award_category: Database["public"]["Enums"]["award_category"] | null
          award_level: Database["public"]["Enums"]["award_level"] | null
          award_name: string | null
          award_type: Database["public"]["Enums"]["award_type"]
          award_year: number | null
          coin_date: string | null
          coin_description: string | null
          coin_presenter: string | null
          created_at: string | null
          cycle_year: number
          denial_reason: string | null
          id: string
          is_team_award: boolean | null
          period_end: string | null
          period_start: string | null
          quarter: Database["public"]["Enums"]["award_quarter"] | null
          recipient_profile_id: string | null
          recipient_team_member_id: string | null
          requester_id: string
          reviewed_at: string | null
          status: Database["public"]["Enums"]["award_request_status"] | null
          updated_at: string | null
        }
        Insert: {
          approver_id: string
          award_category?: Database["public"]["Enums"]["award_category"] | null
          award_level?: Database["public"]["Enums"]["award_level"] | null
          award_name?: string | null
          award_type: Database["public"]["Enums"]["award_type"]
          award_year?: number | null
          coin_date?: string | null
          coin_description?: string | null
          coin_presenter?: string | null
          created_at?: string | null
          cycle_year?: number
          denial_reason?: string | null
          id?: string
          is_team_award?: boolean | null
          period_end?: string | null
          period_start?: string | null
          quarter?: Database["public"]["Enums"]["award_quarter"] | null
          recipient_profile_id?: string | null
          recipient_team_member_id?: string | null
          requester_id: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["award_request_status"] | null
          updated_at?: string | null
        }
        Update: {
          approver_id?: string
          award_category?: Database["public"]["Enums"]["award_category"] | null
          award_level?: Database["public"]["Enums"]["award_level"] | null
          award_name?: string | null
          award_type?: Database["public"]["Enums"]["award_type"]
          award_year?: number | null
          coin_date?: string | null
          coin_description?: string | null
          coin_presenter?: string | null
          created_at?: string | null
          cycle_year?: number
          denial_reason?: string | null
          id?: string
          is_team_award?: boolean | null
          period_end?: string | null
          period_start?: string | null
          quarter?: Database["public"]["Enums"]["award_quarter"] | null
          recipient_profile_id?: string | null
          recipient_team_member_id?: string | null
          requester_id?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["award_request_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "award_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_requests_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_requests_recipient_team_member_id_fkey"
            columns: ["recipient_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      award_shell_sections: {
        Row: {
          category: string
          created_at: string
          custom_context: string
          id: string
          last_edited_by: string | null
          lines_per_statement: number
          selected_action_ids: Json
          shell_id: string
          slot_index: number
          source_type: string
          statement_text: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          custom_context?: string
          id?: string
          last_edited_by?: string | null
          lines_per_statement?: number
          selected_action_ids?: Json
          shell_id: string
          slot_index?: number
          source_type?: string
          statement_text?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          custom_context?: string
          id?: string
          last_edited_by?: string | null
          lines_per_statement?: number
          selected_action_ids?: Json
          shell_id?: string
          slot_index?: number
          source_type?: string
          statement_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_shell_sections_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_sections_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "award_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      award_shell_shares: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          share_type: string
          shared_with_id: string
          shell_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          share_type: string
          shared_with_id: string
          shell_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          share_type?: string
          shared_with_id?: string
          shell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_shell_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_shares_shared_with_id_fkey"
            columns: ["shared_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_shares_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "award_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      award_shell_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          section_id: string
          statement_text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          section_id: string
          statement_text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          section_id?: string
          statement_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_shell_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_snapshots_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "award_shell_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      award_shell_team_members: {
        Row: {
          added_by: string
          created_at: string
          id: string
          profile_id: string | null
          shell_id: string
          team_member_id: string | null
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          profile_id?: string | null
          shell_id: string
          team_member_id?: string | null
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          profile_id?: string | null
          shell_id?: string
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "award_shell_team_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_team_members_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "award_shells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_team_members_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      award_shell_wins: {
        Row: {
          added_by: string
          created_at: string
          generated_award_id: string | null
          id: string
          shell_id: string
          win_level: Database["public"]["Enums"]["award_win_level"]
          won_at: string
        }
        Insert: {
          added_by: string
          created_at?: string
          generated_award_id?: string | null
          id?: string
          shell_id: string
          win_level: Database["public"]["Enums"]["award_win_level"]
          won_at?: string
        }
        Update: {
          added_by?: string
          created_at?: string
          generated_award_id?: string | null
          id?: string
          shell_id?: string
          win_level?: Database["public"]["Enums"]["award_win_level"]
          won_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "award_shell_wins_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_wins_generated_award_id_fkey"
            columns: ["generated_award_id"]
            isOneToOne: false
            referencedRelation: "awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shell_wins_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "award_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      award_shells: {
        Row: {
          award_category: string
          award_level: string
          award_period_type: string
          created_at: string
          created_by: string
          cycle_year: number
          generated_award_id: string | null
          id: string
          is_fiscal_year: boolean
          is_team_award: boolean
          is_winner: boolean
          period_end_date: string | null
          period_start_date: string | null
          quarter: number | null
          sentences_per_statement: number
          team_member_id: string | null
          title: string | null
          updated_at: string
          user_id: string
          win_level: Database["public"]["Enums"]["award_win_level"] | null
          won_at: string | null
        }
        Insert: {
          award_category?: string
          award_level?: string
          award_period_type?: string
          created_at?: string
          created_by: string
          cycle_year: number
          generated_award_id?: string | null
          id?: string
          is_fiscal_year?: boolean
          is_team_award?: boolean
          is_winner?: boolean
          period_end_date?: string | null
          period_start_date?: string | null
          quarter?: number | null
          sentences_per_statement?: number
          team_member_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          win_level?: Database["public"]["Enums"]["award_win_level"] | null
          won_at?: string | null
        }
        Update: {
          award_category?: string
          award_level?: string
          award_period_type?: string
          created_at?: string
          created_by?: string
          cycle_year?: number
          generated_award_id?: string | null
          id?: string
          is_fiscal_year?: boolean
          is_team_award?: boolean
          is_winner?: boolean
          period_end_date?: string | null
          period_start_date?: string | null
          quarter?: number | null
          sentences_per_statement?: number
          team_member_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          win_level?: Database["public"]["Enums"]["award_win_level"] | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "award_shells_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shells_generated_award_id_fkey"
            columns: ["generated_award_id"]
            isOneToOne: false
            referencedRelation: "awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shells_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_shells_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      award_team_members: {
        Row: {
          award_id: string
          created_at: string | null
          id: string
          profile_id: string | null
          team_member_id: string | null
        }
        Insert: {
          award_id: string
          created_at?: string | null
          id?: string
          profile_id?: string | null
          team_member_id?: string | null
        }
        Update: {
          award_id?: string
          created_at?: string | null
          id?: string
          profile_id?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "award_team_members_award_id_fkey"
            columns: ["award_id"]
            isOneToOne: false
            referencedRelation: "awards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_team_members_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      awards: {
        Row: {
          award_category: Database["public"]["Enums"]["award_category"] | null
          award_level: Database["public"]["Enums"]["award_level"] | null
          award_name: string | null
          award_type: Database["public"]["Enums"]["award_type"]
          award_year: number | null
          coin_date: string | null
          coin_description: string | null
          coin_presenter: string | null
          created_at: string | null
          created_by: string
          cycle_year: number
          id: string
          is_team_award: boolean | null
          period_end: string | null
          period_start: string | null
          quarter: Database["public"]["Enums"]["award_quarter"] | null
          recipient_profile_id: string | null
          recipient_team_member_id: string | null
          supervisor_id: string
          updated_at: string | null
        }
        Insert: {
          award_category?: Database["public"]["Enums"]["award_category"] | null
          award_level?: Database["public"]["Enums"]["award_level"] | null
          award_name?: string | null
          award_type: Database["public"]["Enums"]["award_type"]
          award_year?: number | null
          coin_date?: string | null
          coin_description?: string | null
          coin_presenter?: string | null
          created_at?: string | null
          created_by: string
          cycle_year?: number
          id?: string
          is_team_award?: boolean | null
          period_end?: string | null
          period_start?: string | null
          quarter?: Database["public"]["Enums"]["award_quarter"] | null
          recipient_profile_id?: string | null
          recipient_team_member_id?: string | null
          supervisor_id: string
          updated_at?: string | null
        }
        Update: {
          award_category?: Database["public"]["Enums"]["award_category"] | null
          award_level?: Database["public"]["Enums"]["award_level"] | null
          award_name?: string | null
          award_type?: Database["public"]["Enums"]["award_type"]
          award_year?: number | null
          coin_date?: string | null
          coin_description?: string | null
          coin_presenter?: string | null
          created_at?: string | null
          created_by?: string
          cycle_year?: number
          id?: string
          is_team_award?: boolean | null
          period_end?: string | null
          period_start?: string | null
          quarter?: Database["public"]["Enums"]["award_quarter"] | null
          recipient_profile_id?: string | null
          recipient_team_member_id?: string | null
          supervisor_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_recipient_team_member_id_fkey"
            columns: ["recipient_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_supervisor_id_fkey"
            columns: ["supervisor_id"]
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
      duty_description_templates: {
        Row: {
          created_at: string
          id: string
          note: string | null
          office_label: string | null
          rank_label: string | null
          role_label: string | null
          template_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          office_label?: string | null
          rank_label?: string | null
          role_label?: string | null
          template_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          office_label?: string | null
          rank_label?: string | null
          role_label?: string | null
          template_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_description_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_config: {
        Row: {
          base_system_prompt: string
          current_cycle_year: number
          enable_collaboration: boolean
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
          enable_collaboration?: boolean
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
          enable_collaboration?: boolean
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
      epb_duty_description_examples: {
        Row: {
          created_at: string
          created_by: string | null
          example_text: string
          id: string
          note: string | null
          shell_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          example_text: string
          id?: string
          note?: string | null
          shell_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          example_text?: string
          id?: string
          note?: string | null
          shell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_duty_description_examples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_duty_description_examples_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_duty_description_examples_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_duty_description_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          description_text: string
          id: string
          note: string | null
          shell_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description_text: string
          id?: string
          note?: string | null
          shell_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description_text?: string
          id?: string
          note?: string | null
          shell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_duty_description_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_duty_description_snapshots_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_duty_description_snapshots_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_saved_examples: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string | null
          created_by_rank: string | null
          id: string
          mpa: string
          note: string | null
          section_id: string
          shell_id: string
          statement_text: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name?: string | null
          created_by_rank?: string | null
          id?: string
          mpa: string
          note?: string | null
          section_id: string
          shell_id: string
          statement_text: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          created_by_rank?: string | null
          id?: string
          mpa?: string
          note?: string | null
          section_id?: string
          shell_id?: string
          statement_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_saved_examples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_saved_examples_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "epb_shell_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_saved_examples_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_saved_examples_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_section_editing_participants: {
        Row: {
          full_name: string | null
          id: string
          is_host: boolean | null
          joined_at: string | null
          left_at: string | null
          rank: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          full_name?: string | null
          id?: string
          is_host?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          rank?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          full_name?: string | null
          id?: string
          is_host?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          rank?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_section_editing_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "epb_section_editing_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_section_editing_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_section_editing_sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          host_user_id: string
          id: string
          is_active: boolean | null
          last_activity_at: string | null
          section_id: string
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
          last_activity_at?: string | null
          section_id: string
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
          last_activity_at?: string | null
          section_id?: string
          session_code?: string
          updated_at?: string | null
          workspace_state?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "epb_section_editing_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_section_editing_sessions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "epb_shell_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_section_locks: {
        Row: {
          acquired_at: string | null
          expires_at: string | null
          id: string
          section_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string | null
          expires_at?: string | null
          id?: string
          section_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string | null
          expires_at?: string | null
          id?: string
          section_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_section_locks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: true
            referencedRelation: "epb_shell_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_section_locks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_shell_field_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          field_key: string
          id: string
          shell_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          expires_at?: string
          field_key: string
          id?: string
          shell_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          field_key?: string
          id?: string
          shell_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_shell_field_locks_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shell_field_locks_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shell_field_locks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_shell_sections: {
        Row: {
          created_at: string
          id: string
          is_complete: boolean
          last_edited_by: string | null
          mpa: string
          shell_id: string
          statement_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_complete?: boolean
          last_edited_by?: string | null
          mpa: string
          shell_id: string
          statement_text?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_complete?: boolean
          last_edited_by?: string | null
          mpa?: string
          shell_id?: string
          statement_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_shell_sections_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shell_sections_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shell_sections_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_shell_shares: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          share_type: string
          shared_with_id: string
          shell_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          share_type: string
          shared_with_id: string
          shell_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          share_type?: string
          shared_with_id?: string
          shell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_shell_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shell_shares_shared_with_id_fkey"
            columns: ["shared_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shell_shares_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shell_shares_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_shell_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          section_id: string
          statement_text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          section_id: string
          statement_text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          section_id?: string
          statement_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_shell_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shell_snapshots_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "epb_shell_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      epb_shells: {
        Row: {
          archive_name: string | null
          archived_at: string | null
          created_at: string
          created_by: string
          cycle_year: number
          duty_description: string | null
          duty_description_complete: boolean
          id: string
          multi_user_enabled: boolean | null
          status: string
          team_member_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archive_name?: string | null
          archived_at?: string | null
          created_at?: string
          created_by: string
          cycle_year: number
          duty_description?: string | null
          duty_description_complete?: boolean
          id?: string
          multi_user_enabled?: boolean | null
          status?: string
          team_member_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archive_name?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string
          cycle_year?: number
          duty_description?: string | null
          duty_description_complete?: boolean
          id?: string
          multi_user_enabled?: boolean | null
          status?: string
          team_member_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "epb_shells_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shells_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shells_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_catalog_sync_state: {
        Row: {
          id: number
          last_sync_by_user_id: string | null
          last_sync_completed_at: string | null
          last_sync_started_at: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          last_sync_by_user_id?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          last_sync_by_user_id?: string | null
          last_sync_completed_at?: string | null
          last_sync_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_catalog_sync_state_last_sync_by_user_id_fkey"
            columns: ["last_sync_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_model_catalog: {
        Row: {
          created_at: string
          deprecated_at: string | null
          description: string
          display_name: string
          first_seen_at: string
          id: string
          is_active: boolean
          is_app_default: boolean
          last_seen_at: string
          provider: string
          quality: string
          sort_order: number
          statement_tip: string
          supports_default_key: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          deprecated_at?: string | null
          description?: string
          display_name: string
          first_seen_at?: string
          id: string
          is_active?: boolean
          is_app_default?: boolean
          last_seen_at?: string
          provider: string
          quality?: string
          sort_order?: number
          statement_tip?: string
          supports_default_key?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          deprecated_at?: string | null
          description?: string
          display_name?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          is_app_default?: boolean
          last_seen_at?: string
          provider?: string
          quality?: string
          sort_order?: number
          statement_tip?: string
          supports_default_key?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      managed_member_history: {
        Row: {
          created_at: string | null
          id: string
          member_email: string | null
          member_name: string
          member_rank: string | null
          status: string | null
          supervision_end_date: string | null
          supervision_start_date: string | null
          supervisor_id: string
          team_member_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_email?: string | null
          member_name: string
          member_rank?: string | null
          status?: string | null
          supervision_end_date?: string | null
          supervision_start_date?: string | null
          supervisor_id: string
          team_member_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          member_email?: string | null
          member_name?: string
          member_rank?: string | null
          status?: string | null
          supervision_end_date?: string | null
          supervision_start_date?: string | null
          supervisor_id?: string
          team_member_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managed_member_history_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_member_history_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      opb_duty_description_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          description_text: string
          id: string
          note: string | null
          shell_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description_text: string
          id?: string
          note?: string | null
          shell_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description_text?: string
          id?: string
          note?: string | null
          shell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opb_duty_description_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opb_duty_description_snapshots_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "opb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      opb_shell_sections: {
        Row: {
          created_at: string
          id: string
          is_complete: boolean
          last_edited_by: string | null
          mpa: string
          shell_id: string
          statement_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_complete?: boolean
          last_edited_by?: string | null
          mpa: string
          shell_id: string
          statement_text?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_complete?: boolean
          last_edited_by?: string | null
          mpa?: string
          shell_id?: string
          statement_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opb_shell_sections_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opb_shell_sections_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "opb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      opb_shell_shares: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          share_type: string
          shared_with_id: string
          shell_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          share_type: string
          shared_with_id: string
          shell_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          share_type?: string
          shared_with_id?: string
          shell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opb_shell_shares_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opb_shell_shares_shared_with_id_fkey"
            columns: ["shared_with_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opb_shell_shares_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "opb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
      opb_shell_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          section_id: string
          statement_text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          section_id: string
          statement_text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          section_id?: string
          statement_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "opb_shell_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opb_shell_snapshots_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "opb_shell_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      opb_shells: {
        Row: {
          archive_name: string | null
          archived_at: string | null
          created_at: string
          created_by: string
          cycle_year: number
          duty_description: string
          duty_description_complete: boolean
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archive_name?: string | null
          archived_at?: string | null
          created_at?: string
          created_by: string
          cycle_year: number
          duty_description?: string
          duty_description_complete?: boolean
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archive_name?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string
          cycle_year?: number
          duty_description?: string
          duty_description_complete?: boolean
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opb_shells_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opb_shells_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_managed_links: {
        Row: {
          created_at: string | null
          data_synced: boolean | null
          id: string
          responded_at: string | null
          snoozed_until: string | null
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
          snoozed_until?: string | null
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
          snoozed_until?: string | null
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
      project_members: {
        Row: {
          added_by: string
          created_at: string
          id: string
          is_owner: boolean
          profile_id: string | null
          project_id: string
          team_member_id: string | null
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          is_owner?: boolean
          profile_id?: string | null
          project_id: string
          team_member_id?: string | null
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          is_owner?: boolean
          profile_id?: string | null
          project_id?: string
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          cycle_year: number
          description: string | null
          id: string
          impact: string | null
          key_stakeholders: Json | null
          metrics: Json | null
          name: string
          result: string | null
          scope: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          cycle_year?: number
          description?: string | null
          id?: string
          impact?: string | null
          key_stakeholders?: Json | null
          metrics?: Json | null
          name: string
          result?: string | null
          scope?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          cycle_year?: number
          description?: string | null
          id?: string
          impact?: string | null
          key_stakeholders?: Json | null
          metrics?: Json | null
          name?: string
          result?: string | null
          scope?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refined_statements: {
        Row: {
          afsc: string
          applicable_mpas: string[] | null
          award_category: string | null
          created_at: string
          created_by: string | null
          cycle_year: number
          history_id: string | null
          id: string
          is_favorite: boolean
          is_winning_package: boolean | null
          mpa: string
          rank: Database["public"]["Enums"]["user_rank"]
          source_epb_shell_id: string | null
          statement: string
          statement_type: string
          team_member_id: string | null
          updated_at: string
          use_as_llm_example: boolean | null
          user_id: string
          win_level: string | null
        }
        Insert: {
          afsc: string
          applicable_mpas?: string[] | null
          award_category?: string | null
          created_at?: string
          created_by?: string | null
          cycle_year: number
          history_id?: string | null
          id?: string
          is_favorite?: boolean
          is_winning_package?: boolean | null
          mpa: string
          rank: Database["public"]["Enums"]["user_rank"]
          source_epb_shell_id?: string | null
          statement: string
          statement_type?: string
          team_member_id?: string | null
          updated_at?: string
          use_as_llm_example?: boolean | null
          user_id: string
          win_level?: string | null
        }
        Update: {
          afsc?: string
          applicable_mpas?: string[] | null
          award_category?: string | null
          created_at?: string
          created_by?: string | null
          cycle_year?: number
          history_id?: string | null
          id?: string
          is_favorite?: boolean
          is_winning_package?: boolean | null
          mpa?: string
          rank?: Database["public"]["Enums"]["user_rank"]
          source_epb_shell_id?: string | null
          statement?: string
          statement_type?: string
          team_member_id?: string | null
          updated_at?: string
          use_as_llm_example?: boolean | null
          user_id?: string
          win_level?: string | null
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
            foreignKeyName: "refined_statements_source_epb_shell_id_fkey"
            columns: ["source_epb_shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refined_statements_source_epb_shell_id_fkey"
            columns: ["source_epb_shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
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
          statement_type: string
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
          statement_type?: string
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
          statement_type?: string
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
      style_feedback_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "style_feedback_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_expectations: {
        Row: {
          created_at: string | null
          cycle_year: number
          expectation_text: string
          id: string
          subordinate_id: string | null
          supervision_end_date: string | null
          supervision_start_date: string
          supervisor_id: string
          team_member_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cycle_year: number
          expectation_text: string
          id?: string
          subordinate_id?: string | null
          supervision_end_date?: string | null
          supervision_start_date: string
          supervisor_id: string
          team_member_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cycle_year?: number
          expectation_text?: string
          id?: string
          subordinate_id?: string | null
          supervision_end_date?: string | null
          supervision_start_date?: string
          supervisor_id?: string
          team_member_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_expectations_subordinate_id_fkey"
            columns: ["subordinate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_expectations_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_expectations_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_feedbacks: {
        Row: {
          content: string
          created_at: string | null
          cycle_year: number
          feedback_type: string
          id: string
          reviewed_accomplishment_ids: string[] | null
          shared_at: string | null
          status: string
          subordinate_id: string | null
          supervision_end_date: string | null
          supervision_start_date: string
          supervisor_id: string
          team_member_id: string | null
          updated_at: string | null
        }
        Insert: {
          content?: string
          created_at?: string | null
          cycle_year: number
          feedback_type: string
          id?: string
          reviewed_accomplishment_ids?: string[] | null
          shared_at?: string | null
          status?: string
          subordinate_id?: string | null
          supervision_end_date?: string | null
          supervision_start_date: string
          supervisor_id: string
          team_member_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          cycle_year?: number
          feedback_type?: string
          id?: string
          reviewed_accomplishment_ids?: string[] | null
          shared_at?: string | null
          status?: string
          subordinate_id?: string | null
          supervision_end_date?: string | null
          supervision_start_date?: string
          supervisor_id?: string
          team_member_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_feedbacks_subordinate_id_fkey"
            columns: ["subordinate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_feedbacks_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_feedbacks_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_history: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          source_team_member_id: string | null
          started_at: string
          subordinate_id: string
          supervision_end_date: string | null
          supervision_start_date: string | null
          supervisor_id: string
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          source_team_member_id?: string | null
          started_at?: string
          subordinate_id: string
          supervision_end_date?: string | null
          supervision_start_date?: string | null
          supervisor_id: string
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          source_team_member_id?: string | null
          started_at?: string
          subordinate_id?: string
          supervision_end_date?: string | null
          supervision_start_date?: string | null
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_history_source_team_member_id_fkey"
            columns: ["source_team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
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
          supervision_end_date: string | null
          supervision_start_date: string | null
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
          supervision_end_date?: string | null
          supervision_start_date?: string | null
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
          supervision_end_date?: string | null
          supervision_start_date?: string | null
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
          supervision_end_date: string | null
          supervision_start_date: string | null
          supervisor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subordinate_id: string
          supervision_end_date?: string | null
          supervision_start_date?: string | null
          supervisor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subordinate_id?: string
          supervision_end_date?: string | null
          supervision_start_date?: string | null
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
      user_award_categories: {
        Row: {
          category_key: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_default: boolean
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_key: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_default?: boolean
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_key?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_default?: boolean
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_award_categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          created_at: string | null
          feature: string
          feedback: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          feature: string
          feedback: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          feature?: string
          feedback?: string
          id?: string
          user_id?: string | null
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
          award_abbreviations: Json
          award_period_text: string | null
          award_sentences_per_category: Json
          award_style_guidelines: string
          award_system_prompt: string
          base_system_prompt: string
          created_at: string
          current_cycle_year: number
          id: string
          major_graded_areas: Json
          max_characters_per_statement: number
          max_example_statements: number
          model_preferences: Json
          mpa_descriptions: Json
          opb_style_guidelines: string | null
          opb_system_prompt: string | null
          rank_verb_progression: Json
          scod_date: string
          style_guidelines: string
          updated_at: string
          user_id: string
        }
        Insert: {
          abbreviations?: Json
          acronyms?: Json
          award_abbreviations?: Json
          award_period_text?: string | null
          award_sentences_per_category?: Json
          award_style_guidelines?: string
          award_system_prompt?: string
          base_system_prompt?: string
          created_at?: string
          current_cycle_year?: number
          id?: string
          major_graded_areas?: Json
          max_characters_per_statement?: number
          max_example_statements?: number
          model_preferences?: Json
          mpa_descriptions?: Json
          opb_style_guidelines?: string | null
          opb_system_prompt?: string | null
          rank_verb_progression?: Json
          scod_date?: string
          style_guidelines?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          abbreviations?: Json
          acronyms?: Json
          award_abbreviations?: Json
          award_period_text?: string | null
          award_sentences_per_category?: Json
          award_style_guidelines?: string
          award_system_prompt?: string
          base_system_prompt?: string
          created_at?: string
          current_cycle_year?: number
          id?: string
          major_graded_areas?: Json
          max_characters_per_statement?: number
          max_example_statements?: number
          model_preferences?: Json
          mpa_descriptions?: Json
          opb_style_guidelines?: string | null
          opb_system_prompt?: string | null
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
      user_style_examples: {
        Row: {
          category: string
          created_at: string | null
          edit_ratio: number | null
          id: string
          is_finalized: boolean | null
          sequence_num: number | null
          statement_text: string
          user_id: string
          was_ai_assisted: boolean | null
        }
        Insert: {
          category: string
          created_at?: string | null
          edit_ratio?: number | null
          id?: string
          is_finalized?: boolean | null
          sequence_num?: number | null
          statement_text: string
          user_id: string
          was_ai_assisted?: boolean | null
        }
        Update: {
          category?: string
          created_at?: string | null
          edit_ratio?: number | null
          id?: string
          is_finalized?: boolean | null
          sequence_num?: number | null
          statement_text?: string
          user_id?: string
          was_ai_assisted?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "user_style_examples_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_style_profiles: {
        Row: {
          abbreviation_pref: number | null
          aggressiveness_samples: number | null
          avg_aggressiveness: number | null
          created_at: string | null
          fill_to_max_ratio: number | null
          fill_to_max_samples: number | null
          formality_pref: number | null
          id: string
          last_updated: string | null
          metrics_density_pref: number | null
          sentence_length_pref: number | null
          total_manual_edits: number | null
          total_revisions_selected: number | null
          total_statements_analyzed: number | null
          user_id: string
          verb_intensity_pref: number | null
          version_1_count: number | null
          version_2_count: number | null
          version_3_count: number | null
          version_other_count: number | null
        }
        Insert: {
          abbreviation_pref?: number | null
          aggressiveness_samples?: number | null
          avg_aggressiveness?: number | null
          created_at?: string | null
          fill_to_max_ratio?: number | null
          fill_to_max_samples?: number | null
          formality_pref?: number | null
          id?: string
          last_updated?: string | null
          metrics_density_pref?: number | null
          sentence_length_pref?: number | null
          total_manual_edits?: number | null
          total_revisions_selected?: number | null
          total_statements_analyzed?: number | null
          user_id: string
          verb_intensity_pref?: number | null
          version_1_count?: number | null
          version_2_count?: number | null
          version_3_count?: number | null
          version_other_count?: number | null
        }
        Update: {
          abbreviation_pref?: number | null
          aggressiveness_samples?: number | null
          avg_aggressiveness?: number | null
          created_at?: string | null
          fill_to_max_ratio?: number | null
          fill_to_max_samples?: number | null
          formality_pref?: number | null
          id?: string
          last_updated?: string | null
          metrics_density_pref?: number | null
          sentence_length_pref?: number | null
          total_manual_edits?: number | null
          total_revisions_selected?: number | null
          total_statements_analyzed?: number | null
          user_id?: string
          verb_intensity_pref?: number | null
          version_1_count?: number | null
          version_2_count?: number | null
          version_3_count?: number | null
          version_other_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_style_profiles_user_id_fkey"
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
          shell_id: string | null
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
          shell_id?: string | null
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
          shell_id?: string | null
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
          {
            foreignKeyName: "workspace_sessions_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_sessions_shell_id_fkey"
            columns: ["shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      archived_epbs_view: {
        Row: {
          archive_name: string | null
          archived_at: string | null
          created_at: string | null
          cycle_year: number | null
          id: string | null
          ratee_name: string | null
          ratee_rank: Database["public"]["Enums"]["user_rank"] | null
          statement_count: number | null
          team_member_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "epb_shells_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epb_shells_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_description_template_labels: {
        Row: {
          office_label: string | null
          rank_label: string | null
          role_label: string | null
        }
        Relationships: []
      }
      my_subordinate_history: {
        Row: {
          created_at: string | null
          id: string | null
          member_email: string | null
          member_id: string | null
          member_name: string | null
          member_rank: string | null
          relationship_type: string | null
          status: string | null
          supervision_end_date: string | null
          supervision_start_date: string | null
          team_member_id: string | null
        }
        Relationships: []
      }
      my_supervision_history: {
        Row: {
          created_at: string | null
          id: string | null
          relationship_type: string | null
          status: string | null
          subordinate_id: string | null
          supervision_end_date: string | null
          supervision_start_date: string | null
          supervisor_id: string | null
          supervisor_name: string | null
          supervisor_rank: string | null
        }
        Relationships: []
      }
      shared_statements_view: {
        Row: {
          afsc: string | null
          applicable_mpas: string[] | null
          award_category: string | null
          created_at: string | null
          cycle_year: number | null
          id: string | null
          is_favorite: boolean | null
          is_winning_package: boolean | null
          mpa: string | null
          owner_id: string | null
          owner_name: string | null
          owner_rank: Database["public"]["Enums"]["user_rank"] | null
          rank: Database["public"]["Enums"]["user_rank"] | null
          share_id: string | null
          share_type: string | null
          shared_with_id: string | null
          source_epb_shell_id: string | null
          statement: string | null
          statement_type: string | null
          updated_at: string | null
          use_as_llm_example: boolean | null
          win_level: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refined_statements_source_epb_shell_id_fkey"
            columns: ["source_epb_shell_id"]
            isOneToOne: false
            referencedRelation: "archived_epbs_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refined_statements_source_epb_shell_id_fkey"
            columns: ["source_epb_shell_id"]
            isOneToOne: false
            referencedRelation: "epb_shells"
            referencedColumns: ["id"]
          },
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
      acquire_section_lock: {
        Args: { p_section_id: string; p_user_id: string }
        Returns: {
          locked_by_name: string
          locked_by_rank: string
          success: boolean
        }[]
      }
      acquire_shell_field_lock: {
        Args: { p_field_key: string; p_shell_id: string; p_user_id: string }
        Returns: {
          locked_by_name: string
          locked_by_rank: string
          success: boolean
        }[]
      }
      add_award_shell_win_level: {
        Args: {
          p_shell_id: string
          p_win_level: Database["public"]["Enums"]["award_win_level"]
        }
        Returns: string
      }
      approve_award_request: { Args: { p_request_id: string }; Returns: string }
      archive_epb_shell: {
        Args: {
          p_archive_name?: string
          p_clear_after_archive?: boolean
          p_shell_id: string
        }
        Returns: {
          error_message: string
          shell_id: string
          statements_saved: number
          success: boolean
        }[]
      }
      archive_prior_subordinate: {
        Args: { team_member_id: string }
        Returns: Json
      }
      bulk_share_epb_statements: {
        Args: {
          p_share_type: string
          p_shared_with_id?: string
          p_shell_id: string
        }
        Returns: number
      }
      calculate_award_period_dates: {
        Args: {
          p_is_fiscal: boolean
          p_period_type: string
          p_quarter: number
          p_year: number
        }
        Returns: {
          end_date: string
          start_date: string
        }[]
      }
      can_add_project_member: {
        Args: {
          p_project_id: string
          p_target_profile_id: string
          p_target_team_member_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      can_supervise: {
        Args: { rank_value: Database["public"]["Enums"]["user_rank"] }
        Returns: boolean
      }
      can_view_team_member: {
        Args: {
          tm_linked_user_id: string
          tm_parent_profile_id: string
          tm_parent_team_member_id: string
          tm_supervisor_id: string
          viewer_id: string
        }
        Returns: boolean
      }
      cleanup_old_feedback_events: {
        Args: { p_days_old?: number }
        Returns: number
      }
      cleanup_stale_section_sessions: { Args: never; Returns: undefined }
      complete_pending_link: { Args: { link_id: string }; Returns: Json }
      count_project_owners: { Args: { p_project_id: string }; Returns: number }
      create_pending_link_for_existing_user: {
        Args: { p_team_member_id: string; p_user_id: string }
        Returns: Json
      }
      delete_prior_subordinate: {
        Args: { p_delete_data?: boolean; p_team_member_id: string }
        Returns: Json
      }
      deny_award_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: boolean
      }
      dismiss_pending_link: { Args: { link_id: string }; Returns: Json }
      generate_session_code: { Args: never; Returns: string }
      get_accomplishment_chain_members: {
        Args: { acc_id: string }
        Returns: {
          full_name: string
          is_owner: boolean
          rank: string
          user_id: string
        }[]
      }
      get_accomplishment_comment_counts: {
        Args: { acc_ids: string[] }
        Returns: {
          accomplishment_id: string
          total_count: number
          unresolved_count: number
        }[]
      }
      get_all_managed_members: {
        Args: { max_depth?: number; supervisor_uuid: string }
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
      get_award_shell_with_sections: {
        Args: { p_shell_id: string }
        Returns: {
          award_category: string
          award_level: string
          award_period_type: string
          category: string
          created_by: string
          custom_context: string
          cycle_year: number
          is_fiscal_year: boolean
          period_end_date: string
          period_start_date: string
          quarter: number
          section_id: string
          section_updated_at: string
          selected_action_ids: Json
          sentences_per_statement: number
          shell_created_at: string
          shell_id: string
          shell_updated_at: string
          slot_index: number
          source_type: string
          statement_text: string
          team_member_id: string
          user_id: string
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
      get_epb_shell_with_sections: {
        Args: { p_shell_id: string }
        Returns: {
          created_by: string
          cycle_year: number
          mpa: string
          section_id: string
          section_updated_at: string
          shell_created_at: string
          shell_id: string
          shell_updated_at: string
          statement_text: string
          team_member_id: string
          user_id: string
        }[]
      }
      get_expectations_for_member: {
        Args: { p_subordinate_id?: string; p_team_member_id?: string }
        Returns: {
          created_at: string
          cycle_year: number
          expectation_text: string
          id: string
          subordinate_id: string
          supervision_end_date: string
          supervision_start_date: string
          supervisor_id: string
          supervisor_name: string
          supervisor_rank: string
          team_member_id: string
          updated_at: string
        }[]
      }
      get_member_awards: {
        Args: { p_profile_id?: string; p_team_member_id?: string }
        Returns: {
          award_category: Database["public"]["Enums"]["award_category"]
          award_level: Database["public"]["Enums"]["award_level"]
          award_name: string
          award_type: Database["public"]["Enums"]["award_type"]
          award_year: number
          coin_date: string
          coin_description: string
          coin_presenter: string
          created_at: string
          cycle_year: number
          id: string
          is_team_award: boolean
          quarter: Database["public"]["Enums"]["award_quarter"]
        }[]
      }
      get_opb_shell_with_sections: {
        Args: { p_shell_id: string }
        Returns: {
          archive_name: string
          archived_at: string
          created_by: string
          cycle_year: number
          duty_description: string
          duty_description_complete: boolean
          is_complete: boolean
          mpa: string
          section_id: string
          section_updated_at: string
          shell_created_at: string
          shell_id: string
          shell_updated_at: string
          statement_text: string
          status: string
          user_id: string
        }[]
      }
      get_project_members_with_visibility: {
        Args: { p_project_id: string; p_viewer_id: string }
        Returns: {
          afsc: string
          can_view_accomplishments: boolean
          full_name: string
          is_owner: boolean
          member_id: string
          profile_id: string
          rank: string
          team_member_id: string
        }[]
      }
      get_section_active_session: {
        Args: { p_section_id: string; p_user_id: string }
        Returns: {
          host_full_name: string
          host_rank: string
          host_user_id: string
          is_own_session: boolean
          participant_count: number
          session_code: string
          session_id: string
        }[]
      }
      get_shell_field_locks: {
        Args: { p_shell_id: string }
        Returns: {
          out_acquired_at: string
          out_expires_at: string
          out_field_key: string
          out_user_id: string
          out_user_name: string
          out_user_rank: string
        }[]
      }
      get_shell_section_locks: {
        Args: { p_shell_id: string }
        Returns: {
          acquired_at: string
          expires_at: string
          mpa_key: string
          section_id: string
          user_id: string
          user_name: string
          user_rank: string
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
      get_user_projects: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          created_by: string
          cycle_year: number
          description: string | null
          id: string
          impact: string | null
          key_stakeholders: Json | null
          metrics: Json | null
          name: string
          result: string | null
          scope: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_visible_managed_members: {
        Args: { max_depth?: number; viewer_uuid: string }
        Returns: {
          afsc: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_placeholder: boolean
          linked_user_id: string
          member_status: string
          original_profile_id: string
          parent_profile_id: string
          parent_team_member_id: string
          rank: Database["public"]["Enums"]["user_rank"]
          supervision_end_date: string
          supervision_start_date: string
          supervisor_id: string
          unit: string
          updated_at: string
        }[]
      }
      initialize_user_award_categories: {
        Args: { p_user_id: string }
        Returns: {
          category_key: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_default: boolean
          label: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "user_award_categories"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_enlisted_rank: {
        Args: { rank_value: Database["public"]["Enums"]["user_rank"] }
        Returns: boolean
      }
      is_in_accomplishment_chain: {
        Args: { acc_id: string; viewer_id: string }
        Returns: boolean
      }
      is_officer_rank: {
        Args: { rank_value: Database["public"]["Enums"]["user_rank"] }
        Returns: boolean
      }
      is_project_member: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      is_project_owner: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      process_style_feedback: {
        Args: { p_batch_size?: number; p_user_id: string }
        Returns: number
      }
      raise_security_exception: { Args: { code: string }; Returns: undefined }
      refresh_section_lock: {
        Args: { p_section_id: string; p_user_id: string }
        Returns: boolean
      }
      refresh_shell_field_lock: {
        Args: { p_field_key: string; p_shell_id: string; p_user_id: string }
        Returns: boolean
      }
      reject_prior_data_review: { Args: { p_review_id: string }; Returns: Json }
      release_section_lock: {
        Args: { p_section_id: string; p_user_id: string }
        Returns: boolean
      }
      release_shell_field_lock: {
        Args: { p_field_key: string; p_shell_id: string; p_user_id: string }
        Returns: undefined
      }
      remove_award_shell_win_level: {
        Args: {
          p_shell_id: string
          p_win_level: Database["public"]["Enums"]["award_win_level"]
        }
        Returns: boolean
      }
      share_supervisor_feedback: {
        Args: { p_feedback_id: string }
        Returns: boolean
      }
      snooze_pending_link: { Args: { link_id: string }; Returns: boolean }
      sync_managed_account_data: { Args: { link_id: string }; Returns: Json }
      unarchive_epb_shell: { Args: { p_shell_id: string }; Returns: boolean }
      unshare_supervisor_feedback: {
        Args: { p_feedback_id: string }
        Returns: boolean
      }
      update_managed_member_dates: {
        Args: {
          p_end_date?: string
          p_start_date: string
          p_team_member_id: string
        }
        Returns: Json
      }
      update_supervision_dates: {
        Args: {
          p_end_date?: string
          p_start_date: string
          p_subordinate_id: string
        }
        Returns: Json
      }
      upsert_supervisor_expectation: {
        Args: {
          p_cycle_year: number
          p_expectation_text: string
          p_subordinate_id: string
          p_team_member_id: string
        }
        Returns: string
      }
      upsert_supervisor_feedback: {
        Args: {
          p_content: string
          p_cycle_year: number
          p_feedback_type: string
          p_reviewed_accomplishment_ids?: string[]
          p_subordinate_id: string
          p_team_member_id: string
        }
        Returns: string
      }
      user_can_access_shell: {
        Args: { p_shell_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      award_category:
        | "snco"
        | "nco"
        | "amn"
        | "jr_tech"
        | "sr_tech"
        | "innovation"
        | "volunteer"
        | "team"
      award_level: "squadron" | "group" | "wing" | "majcom" | "haf"
      award_quarter: "Q1" | "Q2" | "Q3" | "Q4"
      award_request_status: "pending" | "approved" | "denied"
      award_type: "coin" | "quarterly" | "annual" | "special"
      award_win_level:
        | "flight"
        | "squadron"
        | "tenant_unit"
        | "group"
        | "wing"
        | "haf"
        | "12_oay"
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
        | "Civilian"
        | "2d Lt"
        | "1st Lt"
        | "Capt"
        | "Maj"
        | "Lt Col"
        | "Col"
        | "Brig Gen"
        | "Maj Gen"
        | "Lt Gen"
        | "Gen"
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
      award_category: [
        "snco",
        "nco",
        "amn",
        "jr_tech",
        "sr_tech",
        "innovation",
        "volunteer",
        "team",
      ],
      award_level: ["squadron", "group", "wing", "majcom", "haf"],
      award_quarter: ["Q1", "Q2", "Q3", "Q4"],
      award_request_status: ["pending", "approved", "denied"],
      award_type: ["coin", "quarterly", "annual", "special"],
      award_win_level: [
        "flight",
        "squadron",
        "tenant_unit",
        "group",
        "wing",
        "haf",
        "12_oay",
      ],
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
        "Civilian",
        "2d Lt",
        "1st Lt",
        "Capt",
        "Maj",
        "Lt Col",
        "Col",
        "Brig Gen",
        "Maj Gen",
        "Lt Gen",
        "Gen",
      ],
      user_role: ["supervisor", "subordinate", "admin", "member"],
    },
  },
} as const

