export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      ask_clever_conversations: {
        Row: {
          created_at: string | null;
          id: string;
          title: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id: string;
          title?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          title?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      ask_clever_messages: {
        Row: {
          action: Json | null;
          action_done: boolean | null;
          actions: Json | null;
          chips: Json | null;
          content: string | null;
          conversation_id: string;
          created_at: string | null;
          id: string;
          is_error: boolean | null;
          retry_question: string | null;
          role: string;
          sources_used: Json | null;
          ts: number | null;
          user_id: string;
        };
        Insert: {
          action?: Json | null;
          action_done?: boolean | null;
          actions?: Json | null;
          chips?: Json | null;
          content?: string | null;
          conversation_id?: string;
          created_at?: string | null;
          id: string;
          is_error?: boolean | null;
          retry_question?: string | null;
          role: string;
          sources_used?: Json | null;
          ts?: number | null;
          user_id: string;
        };
        Update: {
          action?: Json | null;
          action_done?: boolean | null;
          actions?: Json | null;
          chips?: Json | null;
          content?: string | null;
          conversation_id?: string;
          created_at?: string | null;
          id?: string;
          is_error?: boolean | null;
          retry_question?: string | null;
          role?: string;
          sources_used?: Json | null;
          ts?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      calendars: {
        Row: {
          color: string;
          created_at: string | null;
          id: string;
          name: string;
          source: string;
          updated_at: string | null;
          user_id: string;
          visible: boolean;
        };
        Insert: {
          color: string;
          created_at?: string | null;
          id: string;
          name: string;
          source?: string;
          updated_at?: string | null;
          user_id: string;
          visible?: boolean;
        };
        Update: {
          color?: string;
          created_at?: string | null;
          id?: string;
          name?: string;
          source?: string;
          updated_at?: string | null;
          user_id?: string;
          visible?: boolean;
        };
        Relationships: [];
      };
      events: {
        Row: {
          all_day: boolean;
          attendees: Json | null;
          calendar_id: string;
          created_at: string | null;
          date: string;
          end_minutes: number;
          google_event_id: string | null;
          id: string;
          is_outdoor: boolean;
          kind: string;
          location: string | null;
          notes: string | null;
          reminder_minutes_before: number | null;
          source: string;
          start_minutes: number;
          status: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          all_day?: boolean;
          attendees?: Json | null;
          calendar_id?: string;
          created_at?: string | null;
          date: string;
          end_minutes: number;
          google_event_id?: string | null;
          id: string;
          is_outdoor?: boolean;
          kind?: string;
          location?: string | null;
          notes?: string | null;
          reminder_minutes_before?: number | null;
          source?: string;
          start_minutes: number;
          status?: string | null;
          title: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          all_day?: boolean;
          attendees?: Json | null;
          calendar_id?: string;
          created_at?: string | null;
          date?: string;
          end_minutes?: number;
          google_event_id?: string | null;
          id?: string;
          is_outdoor?: boolean;
          kind?: string;
          location?: string | null;
          notes?: string | null;
          reminder_minutes_before?: number | null;
          source?: string;
          start_minutes?: number;
          status?: string | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string | null;
          fired: boolean;
          id: string;
          payload_data: Json | null;
          scheduled_at: number;
          target_id: string;
          title: string;
          trigger_timestamp: number;
          type: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string | null;
          fired?: boolean;
          id: string;
          payload_data?: Json | null;
          scheduled_at: number;
          target_id: string;
          title: string;
          trigger_timestamp: number;
          type: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string | null;
          fired?: boolean;
          id?: string;
          payload_data?: Json | null;
          scheduled_at?: number;
          target_id?: string;
          title?: string;
          trigger_timestamp?: number;
          type?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      places: {
        Row: {
          created_at: string | null;
          id: string;
          is_custom: boolean;
          lat: number;
          lon: number;
          name: string;
          sort_order: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id: string;
          is_custom?: boolean;
          lat: number;
          lon: number;
          name: string;
          sort_order?: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_custom?: boolean;
          lat?: number;
          lon?: number;
          name?: string;
          sort_order?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_color: string | null;
          avatar_url: string | null;
          created_at: string | null;
          display_name: string | null;
          email: string | null;
          headline: string | null;
          id: string;
          provider: string | null;
          updated_at: string | null;
        };
        Insert: {
          avatar_color?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          email?: string | null;
          headline?: string | null;
          id: string;
          provider?: string | null;
          updated_at?: string | null;
        };
        Update: {
          avatar_color?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          email?: string | null;
          headline?: string | null;
          id?: string;
          provider?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      reminders: {
        Row: {
          created_at: string | null;
          created_at_client: number | null;
          date: string | null;
          enabled: boolean;
          id: string;
          minutes: number | null;
          place_name: string | null;
          repeat: string;
          title: string;
          trigger: string;
          updated_at: string | null;
          user_id: string;
          weather_rule: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_at_client?: number | null;
          date?: string | null;
          enabled?: boolean;
          id: string;
          minutes?: number | null;
          place_name?: string | null;
          repeat?: string;
          title: string;
          trigger?: string;
          updated_at?: string | null;
          user_id: string;
          weather_rule?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_at_client?: number | null;
          date?: string | null;
          enabled?: boolean;
          id?: string;
          minutes?: number | null;
          place_name?: string | null;
          repeat?: string;
          title?: string;
          trigger?: string;
          updated_at?: string | null;
          user_id?: string;
          weather_rule?: string | null;
        };
        Relationships: [];
      };
      task_lists: {
        Row: {
          color: string;
          created_at: string | null;
          icon: string;
          id: string;
          name: string;
          source: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          color: string;
          created_at?: string | null;
          icon: string;
          id: string;
          name: string;
          source?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          color?: string;
          created_at?: string | null;
          icon?: string;
          id?: string;
          name?: string;
          source?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          completed_at: number | null;
          context: string;
          created_at: string | null;
          created_at_client: number | null;
          done: boolean;
          due_date: string | null;
          due_minutes: number | null;
          estimate_min: number | null;
          google_task_id: string | null;
          id: string;
          list_id: string;
          notes: string | null;
          priority: string;
          reminder_minutes_before: number | null;
          source: string;
          subtasks: Json | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          completed_at?: number | null;
          context?: string;
          created_at?: string | null;
          created_at_client?: number | null;
          done?: boolean;
          due_date?: string | null;
          due_minutes?: number | null;
          estimate_min?: number | null;
          google_task_id?: string | null;
          id: string;
          list_id?: string;
          notes?: string | null;
          priority?: string;
          reminder_minutes_before?: number | null;
          source?: string;
          subtasks?: Json | null;
          title: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          completed_at?: number | null;
          context?: string;
          created_at?: string | null;
          created_at_client?: number | null;
          done?: boolean;
          due_date?: string | null;
          due_minutes?: number | null;
          estimate_min?: number | null;
          google_task_id?: string | null;
          id?: string;
          list_id?: string;
          notes?: string | null;
          priority?: string;
          reminder_minutes_before?: number | null;
          source?: string;
          subtasks?: Json | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          auto_suggest: boolean | null;
          bold_text: boolean | null;
          dynamic_weather_theme: boolean | null;
          gemini_tone: string | null;
          high_contrast: boolean | null;
          large_text: boolean | null;
          notifications: Json | null;
          reduce_motion: boolean | null;
          temp_unit: string | null;
          theme_mode: string | null;
          updated_at: string | null;
          use_24h: boolean | null;
          user_id: string;
          weather_override: string | null;
          week_starts_monday: boolean | null;
          wind_unit: string | null;
        };
        Insert: {
          auto_suggest?: boolean | null;
          bold_text?: boolean | null;
          dynamic_weather_theme?: boolean | null;
          gemini_tone?: string | null;
          high_contrast?: boolean | null;
          large_text?: boolean | null;
          notifications?: Json | null;
          reduce_motion?: boolean | null;
          temp_unit?: string | null;
          theme_mode?: string | null;
          updated_at?: string | null;
          use_24h?: boolean | null;
          user_id: string;
          weather_override?: string | null;
          week_starts_monday?: boolean | null;
          wind_unit?: string | null;
        };
        Update: {
          auto_suggest?: boolean | null;
          bold_text?: boolean | null;
          dynamic_weather_theme?: boolean | null;
          gemini_tone?: string | null;
          high_contrast?: boolean | null;
          large_text?: boolean | null;
          notifications?: Json | null;
          reduce_motion?: boolean | null;
          temp_unit?: string | null;
          theme_mode?: string | null;
          updated_at?: string | null;
          use_24h?: boolean | null;
          user_id?: string;
          weather_override?: string | null;
          week_starts_monday?: boolean | null;
          wind_unit?: string | null;
        };
        Relationships: [];
      };
      user_stats: {
        Row: {
          completed_total: number;
          last_active: string;
          plans_made: number;
          streak: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          completed_total?: number;
          last_active: string;
          plans_made?: number;
          streak?: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          completed_total?: number;
          last_active?: string;
          plans_made?: number;
          streak?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
