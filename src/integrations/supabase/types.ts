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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      analises_conversa: {
        Row: {
          created_at: string
          historico_id: string | null
          id: string
          proporcao_fala_vendedor: number | null
          sinais_de_fechamento: Json
          termos_chave_cliente: Json
          vendedor_falou_demais: boolean | null
        }
        Insert: {
          created_at?: string
          historico_id?: string | null
          id?: string
          proporcao_fala_vendedor?: number | null
          sinais_de_fechamento?: Json
          termos_chave_cliente?: Json
          vendedor_falou_demais?: boolean | null
        }
        Update: {
          created_at?: string
          historico_id?: string | null
          id?: string
          proporcao_fala_vendedor?: number | null
          sinais_de_fechamento?: Json
          termos_chave_cliente?: Json
          vendedor_falou_demais?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "analises_conversa_historico_id_fkey"
            columns: ["historico_id"]
            isOneToOne: false
            referencedRelation: "historico_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      app_data_backups: {
        Row: {
          consultor: string
          content_hash: string
          created_at: string
          id: string
          item_count: number
          payload: Json
          reason: string
          schema_version: number
        }
        Insert: {
          consultor: string
          content_hash: string
          created_at?: string
          id?: string
          item_count?: number
          payload: Json
          reason?: string
          schema_version?: number
        }
        Update: {
          consultor?: string
          content_hash?: string
          created_at?: string
          id?: string
          item_count?: number
          payload?: Json
          reason?: string
          schema_version?: number
        }
        Relationships: []
      }
      call_logs: {
        Row: {
          called_at: string
          cnpj: string | null
          company_name: string
          consultor: string | null
          created_at: string
          id: string
          meeting_at: string | null
          meeting_email: string | null
          meeting_held: boolean
          meeting_outcome: string | null
          meeting_scheduled: boolean
          notes: string | null
        }
        Insert: {
          called_at?: string
          cnpj?: string | null
          company_name: string
          consultor?: string | null
          created_at?: string
          id?: string
          meeting_at?: string | null
          meeting_email?: string | null
          meeting_held?: boolean
          meeting_outcome?: string | null
          meeting_scheduled?: boolean
          notes?: string | null
        }
        Update: {
          called_at?: string
          cnpj?: string | null
          company_name?: string
          consultor?: string | null
          created_at?: string
          id?: string
          meeting_at?: string | null
          meeting_email?: string | null
          meeting_held?: boolean
          meeting_outcome?: string | null
          meeting_scheduled?: boolean
          notes?: string | null
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          biggest_obstacle: string
          closing_details: string | null
          companies_approached: string
          contacts_made: number
          created_at: string
          decision_maker_calls: number
          documents_received: number
          had_closing: boolean
          id: string
          meetings_held: number
          next_step: string
          partner_name: string
          report_date: string
          updated_at: string
        }
        Insert: {
          biggest_obstacle: string
          closing_details?: string | null
          companies_approached: string
          contacts_made?: number
          created_at?: string
          decision_maker_calls?: number
          documents_received?: number
          had_closing?: boolean
          id?: string
          meetings_held?: number
          next_step: string
          partner_name: string
          report_date: string
          updated_at?: string
        }
        Update: {
          biggest_obstacle?: string
          closing_details?: string | null
          companies_approached?: string
          contacts_made?: number
          created_at?: string
          decision_maker_calls?: number
          documents_received?: number
          had_closing?: boolean
          id?: string
          meetings_held?: number
          next_step?: string
          partner_name?: string
          report_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          action_type: string
          cnpj: string | null
          company_name: string
          consultor: string | null
          contact_person: string | null
          created_at: string
          email_sent: boolean
          email_sent_at: string | null
          id: string
          meeting_held: boolean
          meeting_outcome: string | null
          notes: string | null
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          action_type?: string
          cnpj?: string | null
          company_name: string
          consultor?: string | null
          contact_person?: string | null
          created_at?: string
          email_sent?: boolean
          email_sent_at?: string | null
          id?: string
          meeting_held?: boolean
          meeting_outcome?: string | null
          notes?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          cnpj?: string | null
          company_name?: string
          consultor?: string | null
          contact_person?: string | null
          created_at?: string
          email_sent?: boolean
          email_sent_at?: string | null
          id?: string
          meeting_held?: boolean
          meeting_outcome?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      historico_empresas: {
        Row: {
          arquivado_manual: boolean
          cargo: string | null
          cnpj: string | null
          consultor: string
          contato: string | null
          created_at: string
          data_iso: string
          descricao_original: string | null
          empresa_nome: string
          id: string
          interesse: string | null
          objecao: string | null
          proxima_acao: string | null
          proxima_acao_data: string | null
          resultado: string | null
          status: string
          texto_historico_completo: string
        }
        Insert: {
          arquivado_manual?: boolean
          cargo?: string | null
          cnpj?: string | null
          consultor: string
          contato?: string | null
          created_at?: string
          data_iso?: string
          descricao_original?: string | null
          empresa_nome: string
          id?: string
          interesse?: string | null
          objecao?: string | null
          proxima_acao?: string | null
          proxima_acao_data?: string | null
          resultado?: string | null
          status?: string
          texto_historico_completo: string
        }
        Update: {
          arquivado_manual?: boolean
          cargo?: string | null
          cnpj?: string | null
          consultor?: string
          contato?: string | null
          created_at?: string
          data_iso?: string
          descricao_original?: string | null
          empresa_nome?: string
          id?: string
          interesse?: string | null
          objecao?: string | null
          proxima_acao?: string | null
          proxima_acao_data?: string | null
          resultado?: string | null
          status?: string
          texto_historico_completo?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          anexos: Json | null
          area_negociacao: string
          ata_enviada_em: string | null
          ata_executiva: string | null
          cargo: string | null
          cnpj: string
          comissao_percentual: number | null
          consultor: string
          contato: string | null
          contrato_assinado_em: string | null
          created_at: string
          data_reuniao: string | null
          docs_recebidos_em: string | null
          em_followup_frio: boolean
          email: string | null
          empresa: string
          fase_antes_pausa: string | null
          fechamento_direto: boolean
          follow_ups: Json | null
          id: string
          modalidade_coleta: string | null
          motivo_perda: string | null
          no_show_count: number
          oportunidades: Json | null
          pausado_ate: string | null
          pausado_motivo: string[] | null
          percentual_honorarios: number | null
          proximo_passo: string | null
          rd_deal_id: string | null
          reagendamentos: number | null
          stage_since: string | null
          status: string
          telefone: string | null
          timeline: Json | null
          tipo_negociacao: string
          ultima_observacao: string | null
          updated_at: string
          valor_credito: number | null
        }
        Insert: {
          anexos?: Json | null
          area_negociacao?: string
          ata_enviada_em?: string | null
          ata_executiva?: string | null
          cargo?: string | null
          cnpj: string
          comissao_percentual?: number | null
          consultor: string
          contato?: string | null
          contrato_assinado_em?: string | null
          created_at?: string
          data_reuniao?: string | null
          docs_recebidos_em?: string | null
          em_followup_frio?: boolean
          email?: string | null
          empresa: string
          fase_antes_pausa?: string | null
          fechamento_direto?: boolean
          follow_ups?: Json | null
          id?: string
          modalidade_coleta?: string | null
          motivo_perda?: string | null
          no_show_count?: number
          oportunidades?: Json | null
          pausado_ate?: string | null
          pausado_motivo?: string[] | null
          percentual_honorarios?: number | null
          proximo_passo?: string | null
          rd_deal_id?: string | null
          reagendamentos?: number | null
          stage_since?: string | null
          status: string
          telefone?: string | null
          timeline?: Json | null
          tipo_negociacao?: string
          ultima_observacao?: string | null
          updated_at?: string
          valor_credito?: number | null
        }
        Update: {
          anexos?: Json | null
          area_negociacao?: string
          ata_enviada_em?: string | null
          ata_executiva?: string | null
          cargo?: string | null
          cnpj?: string
          comissao_percentual?: number | null
          consultor?: string
          contato?: string | null
          contrato_assinado_em?: string | null
          created_at?: string
          data_reuniao?: string | null
          docs_recebidos_em?: string | null
          em_followup_frio?: boolean
          email?: string | null
          empresa?: string
          fase_antes_pausa?: string | null
          fechamento_direto?: boolean
          follow_ups?: Json | null
          id?: string
          modalidade_coleta?: string | null
          motivo_perda?: string | null
          no_show_count?: number
          oportunidades?: Json | null
          pausado_ate?: string | null
          pausado_motivo?: string[] | null
          percentual_honorarios?: number | null
          proximo_passo?: string | null
          rd_deal_id?: string | null
          reagendamentos?: number | null
          stage_since?: string | null
          status?: string
          telefone?: string | null
          timeline?: Json | null
          tipo_negociacao?: string
          ultima_observacao?: string | null
          updated_at?: string
          valor_credito?: number | null
        }
        Relationships: []
      }
      user_prompts: {
        Row: {
          consultor: string
          conteudo: string
          created_at: string
          id: string
          is_active: boolean
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          consultor: string
          conteudo: string
          created_at?: string
          id?: string
          is_active?: boolean
          nome: string
          tipo: string
          updated_at?: string
        }
        Update: {
          consultor?: string
          conteudo?: string
          created_at?: string
          id?: string
          is_active?: boolean
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
