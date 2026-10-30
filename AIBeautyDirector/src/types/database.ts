export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
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
      active_conflict_rules: {
        Row: {
          active_a: string
          active_b: string
          note: string | null
          rule: string
        }
        Insert: {
          active_a: string
          active_b: string
          note?: string | null
          rule: string
        }
        Update: {
          active_a?: string
          active_b?: string
          note?: string | null
          rule?: string
        }
        Relationships: []
      }
      chat_actions: {
        Row: {
          action: Json
          block_id: string
          created_at: string
          id: string
          message_id: string
          result: string
          thread_id: string
          user_id: string
        }
        Insert: {
          action: Json
          block_id: string
          created_at?: string
          id?: string
          message_id: string
          result: string
          thread_id: string
          user_id: string
        }
        Update: {
          action?: Json
          block_id?: string
          created_at?: string
          id?: string
          message_id?: string
          result?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_actions_thread_id_user_id_fkey"
            columns: ["thread_id", "user_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          blocks: Json
          completion_tokens: number | null
          content: string
          created_at: string
          id: string
          model: string | null
          prompt_tokens: number | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          blocks?: Json
          completion_tokens?: number | null
          content: string
          created_at?: string
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          blocks?: Json
          completion_tokens?: number | null
          content?: string
          created_at?: string
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_user_id_fkey"
            columns: ["thread_id", "user_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          busy_until: string | null
          created_at: string
          id: string
          last_message_at: string
          origin: string
          scan_id: string | null
          summary: string | null
          summary_through_message_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          busy_until?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          origin?: string
          scan_id?: string | null
          summary?: string | null
          summary_through_message_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          busy_until?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          origin?: string
          scan_id?: string | null
          summary?: string | null
          summary_through_message_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_scan_id_user_id_fkey"
            columns: ["scan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      consents: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          policy_version: string
          purpose: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted: boolean
          id?: string
          policy_version: string
          purpose: string
          user_id?: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          policy_version?: string
          purpose?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_checkins: {
        Row: {
          created_at: string
          dryness: number | null
          id: string
          local_date: string
          oiliness: number | null
          stinging: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dryness?: number | null
          id?: string
          local_date: string
          oiliness?: number | null
          stinging?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          dryness?: number | null
          id?: string
          local_date?: string
          oiliness?: number | null
          stinging?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_reactions: {
        Row: {
          created_at: string
          id: string
          ingredient: string | null
          noted_at: string
          product_id: string | null
          reaction: string
          resolved_at: string | null
          severity: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient?: string | null
          noted_at?: string
          product_id?: string | null
          reaction: string
          resolved_at?: string | null
          severity?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient?: string | null
          noted_at?: string
          product_id?: string | null
          reaction?: string
          resolved_at?: string | null
          severity?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reactions_product_id_user_id_fkey"
            columns: ["product_id", "user_id"]
            isOneToOne: false
            referencedRelation: "user_products"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profile_change_events: {
        Row: {
          created_at: string
          entity: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          row_id: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          row_id: string
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          row_id?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          display_name: string | null
          gender: string | null
          onboarding_completed: boolean
          onboarding_step: number
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          gender?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          display_name?: string | null
          gender?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      routine_completions: {
        Row: {
          completed_step_ids: string[]
          created_at: string
          id: string
          local_date: string
          period: string
          routine_id: string | null
          skipped_step_ids: string[]
          user_id: string
        }
        Insert: {
          completed_step_ids?: string[]
          created_at?: string
          id?: string
          local_date: string
          period: string
          routine_id?: string | null
          skipped_step_ids?: string[]
          user_id?: string
        }
        Update: {
          completed_step_ids?: string[]
          created_at?: string
          id?: string
          local_date?: string
          period?: string
          routine_id?: string | null
          skipped_step_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_completions_routine_id_user_id_fkey"
            columns: ["routine_id", "user_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      routine_steps: {
        Row: {
          created_at: string
          id: string
          name: string | null
          position: number
          product_id: string | null
          routine_id: string
          step_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          position: number
          product_id?: string | null
          routine_id: string
          step_type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          position?: number
          product_id?: string | null
          routine_id?: string
          step_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_steps_product_id_user_id_fkey"
            columns: ["product_id", "user_id"]
            isOneToOne: false
            referencedRelation: "user_products"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "routine_steps_routine_id_user_id_fkey"
            columns: ["routine_id", "user_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      routines: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          period: string
          source: string
          supersedes_routine_id: string | null
          updated_at: string
          user_id: string
          version: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          period: string
          source?: string
          supersedes_routine_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          period?: string
          source?: string
          supersedes_routine_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "routines_supersedes_routine_id_user_id_fkey"
            columns: ["supersedes_routine_id", "user_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      scan_metrics: {
        Row: {
          created_at: string
          id: string
          metric_code: string
          metric_definition_version: string
          scan_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          metric_code: string
          metric_definition_version: string
          scan_id: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          metric_code?: string
          metric_definition_version?: string
          scan_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scan_metrics_scan_id_user_id_fkey"
            columns: ["scan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      scans: {
        Row: {
          capture_protocol_version: string
          completed_at: string | null
          created_at: string
          failure_code: string | null
          id: string
          image_path: string | null
          provider: string
          provider_job_id: string | null
          provider_model_version: string | null
          provider_raw: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capture_protocol_version: string
          completed_at?: string | null
          created_at?: string
          failure_code?: string | null
          id?: string
          image_path?: string | null
          provider: string
          provider_job_id?: string | null
          provider_model_version?: string | null
          provider_raw?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capture_protocol_version?: string
          completed_at?: string | null
          created_at?: string
          failure_code?: string | null
          id?: string
          image_path?: string | null
          provider?: string
          provider_job_id?: string | null
          provider_model_version?: string | null
          provider_raw?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skin_profiles: {
        Row: {
          budget: string | null
          created_at: string
          goals: string[]
          routine_level: string | null
          textures: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: string | null
          created_at?: string
          goals?: string[]
          routine_level?: string | null
          textures?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: string | null
          created_at?: string
          goals?: string[]
          routine_level?: string | null
          textures?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_products: {
        Row: {
          brand: string | null
          catalog_product_id: string | null
          category: string
          created_at: string
          id: string
          ingredients_text: string | null
          key_actives: string[]
          name: string
          notes: string | null
          opened_at: string | null
          status: string
          updated_at: string
          use_time: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          catalog_product_id?: string | null
          category?: string
          created_at?: string
          id?: string
          ingredients_text?: string | null
          key_actives?: string[]
          name: string
          notes?: string | null
          opened_at?: string | null
          status?: string
          updated_at?: string
          use_time?: string
          user_id?: string
        }
        Update: {
          brand?: string | null
          catalog_product_id?: string | null
          category?: string
          created_at?: string
          id?: string
          ingredients_text?: string | null
          key_actives?: string[]
          name?: string
          notes?: string | null
          opened_at?: string | null
          status?: string
          updated_at?: string
          use_time?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          am_reminder_enabled: boolean
          am_reminder_time: string
          created_at: string
          locale: string
          persona: string
          pm_reminder_enabled: boolean
          pm_reminder_time: string
          scan_reminder_enabled: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          am_reminder_enabled?: boolean
          am_reminder_time?: string
          created_at?: string
          locale?: string
          persona?: string
          pm_reminder_enabled?: boolean
          pm_reminder_time?: string
          scan_reminder_enabled?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          am_reminder_enabled?: boolean
          am_reminder_time?: string
          created_at?: string
          locale?: string
          persona?: string
          pm_reminder_enabled?: boolean
          pm_reminder_time?: string
          scan_reminder_enabled?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      current_consents: {
        Row: {
          created_at: string | null
          granted: boolean | null
          policy_version: string | null
          purpose: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_chat_action: {
        Args: {
          p_action: Json
          p_block_id: string
          p_message_id: string
          p_thread_id: string
          p_user_id: string
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
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {},
  },
} as const
