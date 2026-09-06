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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assessment: {
        Row: {
          assessed_at: string
          assessed_by: string
          avpu: Database["public"]["Enums"]["avpu_level"] | null
          case_id: string
          created_at: string
          dbp: number | null
          findings: string | null
          gcs: number | null
          id: string
          kind: Database["public"]["Enums"]["assessment_kind"]
          leg_id: string | null
          pulse: number | null
          resp_rate: number | null
          sbp: number | null
          spo2: number | null
          temperature: number | null
          treatment: string | null
          triage: Database["public"]["Enums"]["triage_color"] | null
        }
        Insert: {
          assessed_at?: string
          assessed_by: string
          avpu?: Database["public"]["Enums"]["avpu_level"] | null
          case_id: string
          created_at?: string
          dbp?: number | null
          findings?: string | null
          gcs?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["assessment_kind"]
          leg_id?: string | null
          pulse?: number | null
          resp_rate?: number | null
          sbp?: number | null
          spo2?: number | null
          temperature?: number | null
          treatment?: string | null
          triage?: Database["public"]["Enums"]["triage_color"] | null
        }
        Update: {
          assessed_at?: string
          assessed_by?: string
          avpu?: Database["public"]["Enums"]["avpu_level"] | null
          case_id?: string
          created_at?: string
          dbp?: number | null
          findings?: string | null
          gcs?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["assessment_kind"]
          leg_id?: string | null
          pulse?: number | null
          resp_rate?: number | null
          sbp?: number | null
          spo2?: number | null
          temperature?: number | null
          treatment?: string | null
          triage?: Database["public"]["Enums"]["triage_color"] | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_case_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "transfer_leg"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "v_leg_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      case: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          case_code: string
          chief_complaint: string
          client_uuid: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          dest_unit_id: string | null
          disposed_at: string | null
          disposition_route:
            | Database["public"]["Enums"]["disposition_route"]
            | null
          feedback_note: string | null
          hostile_action: boolean | null
          icd10: string | null
          id: string
          injury_grid: string | null
          injury_place: string | null
          injury_sites: Json
          is_synthetic: boolean
          mechanism: string | null
          nbc_status: Database["public"]["Enums"]["nbc_status"]
          on_duty: boolean | null
          operation_type: string | null
          origin_unit_id: string
          outcome: Database["public"]["Enums"]["case_outcome"] | null
          patient_alias: string | null
          patient_count: number
          patient_mobility:
            | Database["public"]["Enums"]["patient_mobility"]
            | null
          patient_rank_group: Database["public"]["Enums"]["rank_group"] | null
          pickup_grid: string | null
          pickup_marking: string | null
          precedence: Database["public"]["Enums"]["precedence_level"]
          protective_gear: Json
          report_category: Database["public"]["Enums"]["report_category"] | null
          requested_at: string
          security_status: Database["public"]["Enums"]["security_status"] | null
          status: Database["public"]["Enums"]["case_status"]
          symptom_onset_at: string | null
          transport_mode: Database["public"]["Enums"]["transport_mode"] | null
          triage: Database["public"]["Enums"]["triage_color"] | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          case_code: string
          chief_complaint: string
          client_uuid?: string | null
          closed_at?: string | null
          created_at?: string
          created_by: string
          dest_unit_id?: string | null
          disposed_at?: string | null
          disposition_route?:
            | Database["public"]["Enums"]["disposition_route"]
            | null
          feedback_note?: string | null
          hostile_action?: boolean | null
          icd10?: string | null
          id?: string
          injury_grid?: string | null
          injury_place?: string | null
          injury_sites?: Json
          is_synthetic?: boolean
          mechanism?: string | null
          nbc_status?: Database["public"]["Enums"]["nbc_status"]
          on_duty?: boolean | null
          operation_type?: string | null
          origin_unit_id: string
          outcome?: Database["public"]["Enums"]["case_outcome"] | null
          patient_alias?: string | null
          patient_count?: number
          patient_mobility?:
            | Database["public"]["Enums"]["patient_mobility"]
            | null
          patient_rank_group?: Database["public"]["Enums"]["rank_group"] | null
          pickup_grid?: string | null
          pickup_marking?: string | null
          precedence: Database["public"]["Enums"]["precedence_level"]
          protective_gear?: Json
          report_category?:
            | Database["public"]["Enums"]["report_category"]
            | null
          requested_at?: string
          security_status?:
            | Database["public"]["Enums"]["security_status"]
            | null
          status?: Database["public"]["Enums"]["case_status"]
          symptom_onset_at?: string | null
          transport_mode?: Database["public"]["Enums"]["transport_mode"] | null
          triage?: Database["public"]["Enums"]["triage_color"] | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          case_code?: string
          chief_complaint?: string
          client_uuid?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          dest_unit_id?: string | null
          disposed_at?: string | null
          disposition_route?:
            | Database["public"]["Enums"]["disposition_route"]
            | null
          feedback_note?: string | null
          hostile_action?: boolean | null
          icd10?: string | null
          id?: string
          injury_grid?: string | null
          injury_place?: string | null
          injury_sites?: Json
          is_synthetic?: boolean
          mechanism?: string | null
          nbc_status?: Database["public"]["Enums"]["nbc_status"]
          on_duty?: boolean | null
          operation_type?: string | null
          origin_unit_id?: string
          outcome?: Database["public"]["Enums"]["case_outcome"] | null
          patient_alias?: string | null
          patient_count?: number
          patient_mobility?:
            | Database["public"]["Enums"]["patient_mobility"]
            | null
          patient_rank_group?: Database["public"]["Enums"]["rank_group"] | null
          pickup_grid?: string | null
          pickup_marking?: string | null
          precedence?: Database["public"]["Enums"]["precedence_level"]
          protective_gear?: Json
          report_category?:
            | Database["public"]["Enums"]["report_category"]
            | null
          requested_at?: string
          security_status?:
            | Database["public"]["Enums"]["security_status"]
            | null
          status?: Database["public"]["Enums"]["case_status"]
          symptom_onset_at?: string | null
          transport_mode?: Database["public"]["Enums"]["transport_mode"] | null
          triage?: Database["public"]["Enums"]["triage_color"] | null
        }
        Relationships: [
          {
            foreignKeyName: "case_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_dest_unit_id_fkey"
            columns: ["dest_unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_origin_unit_id_fkey"
            columns: ["origin_unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
        ]
      }
      case_code_counter: {
        Row: {
          buddhist_year: number
          last_no: number
        }
        Insert: {
          buddhist_year: number
          last_no?: number
        }
        Update: {
          buddhist_year?: number
          last_no?: number
        }
        Relationships: []
      }
      event_log: {
        Row: {
          action: string
          actor_id: string | null
          case_id: string | null
          created_at: string
          from_value: string | null
          id: number
          leg_id: string | null
          payload: Json | null
          to_value: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          case_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: number
          leg_id?: string | null
          payload?: Json | null
          to_value?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          case_id?: string | null
          created_at?: string
          from_value?: string | null
          id?: number
          leg_id?: string | null
          payload?: Json | null
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_case_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "transfer_leg"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_log_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "v_leg_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_point: {
        Row: {
          created_at: string
          grid_ref: string | null
          id: string
          is_active: boolean
          name: string
          note: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string
          grid_ref?: string | null
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string
          grid_ref?: string | null
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_point_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          rank_th: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          service_number: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          rank_th?: string | null
          roles?: Database["public"]["Enums"]["app_role"][]
          service_number: string
          unit_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          rank_th?: string | null
          roles?: Database["public"]["Enums"]["app_role"][]
          service_number?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
        ]
      }
      property_item: {
        Row: {
          case_id: string
          cash_thb: number | null
          created_at: string
          id: string
          item_name: string
          note: string | null
          qty: number
          recorded_at: string
          recorded_by: string
          unit_label: string | null
          weapon_serial: string | null
        }
        Insert: {
          case_id: string
          cash_thb?: number | null
          created_at?: string
          id?: string
          item_name: string
          note?: string | null
          qty?: number
          recorded_at?: string
          recorded_by: string
          unit_label?: string | null
          weapon_serial?: string | null
        }
        Update: {
          case_id?: string
          cash_thb?: number | null
          created_at?: string
          id?: string
          item_name?: string
          note?: string | null
          qty?: number
          recorded_at?: string
          recorded_by?: string
          unit_label?: string | null
          weapon_serial?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_item_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_item_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_case_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_item_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_leg: {
        Row: {
          arrived_at: string | null
          case_id: string
          client_uuid: string | null
          created_at: string
          delay_reason: string | null
          departed_at: string | null
          dispatched_at: string | null
          docs_ok: boolean | null
          evac_director: string | null
          from_unit_id: string
          handover_at: string | null
          id: string
          leg_no: number
          missing_note: string | null
          note: string | null
          on_scene_at: string | null
          property_ok: boolean | null
          receiver_id: string | null
          requested_at: string
          role_level: Database["public"]["Enums"]["role_of_care"]
          status: Database["public"]["Enums"]["leg_status"]
          to_unit_id: string
          transporter_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          arrived_at?: string | null
          case_id: string
          client_uuid?: string | null
          created_at?: string
          delay_reason?: string | null
          departed_at?: string | null
          dispatched_at?: string | null
          docs_ok?: boolean | null
          evac_director?: string | null
          from_unit_id: string
          handover_at?: string | null
          id?: string
          leg_no: number
          missing_note?: string | null
          note?: string | null
          on_scene_at?: string | null
          property_ok?: boolean | null
          receiver_id?: string | null
          requested_at?: string
          role_level: Database["public"]["Enums"]["role_of_care"]
          status?: Database["public"]["Enums"]["leg_status"]
          to_unit_id: string
          transporter_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          arrived_at?: string | null
          case_id?: string
          client_uuid?: string | null
          created_at?: string
          delay_reason?: string | null
          departed_at?: string | null
          dispatched_at?: string | null
          docs_ok?: boolean | null
          evac_director?: string | null
          from_unit_id?: string
          handover_at?: string | null
          id?: string
          leg_no?: number
          missing_note?: string | null
          note?: string | null
          on_scene_at?: string | null
          property_ok?: boolean | null
          receiver_id?: string | null
          requested_at?: string
          role_level?: Database["public"]["Enums"]["role_of_care"]
          status?: Database["public"]["Enums"]["leg_status"]
          to_unit_id?: string
          transporter_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_leg_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_case_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment: {
        Row: {
          case_id: string
          created_at: string
          detail: string | null
          dose: string | null
          given_at: string
          given_by: string
          id: string
          leg_id: string | null
          released_by: string | null
          route: string | null
          site: string | null
          tourniquet_off: string | null
          tx_code: Database["public"]["Enums"]["tx_code"]
        }
        Insert: {
          case_id: string
          created_at?: string
          detail?: string | null
          dose?: string | null
          given_at?: string
          given_by: string
          id?: string
          leg_id?: string | null
          released_by?: string | null
          route?: string | null
          site?: string | null
          tourniquet_off?: string | null
          tx_code: Database["public"]["Enums"]["tx_code"]
        }
        Update: {
          case_id?: string
          created_at?: string
          detail?: string | null
          dose?: string | null
          given_at?: string
          given_by?: string
          id?: string
          leg_id?: string | null
          released_by?: string | null
          route?: string | null
          site?: string | null
          tourniquet_off?: string | null
          tx_code?: Database["public"]["Enums"]["tx_code"]
        }
        Relationships: [
          {
            foreignKeyName: "treatment_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_case_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_given_by_fkey"
            columns: ["given_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "transfer_leg"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "v_leg_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      unit: {
        Row: {
          bed_available: number | null
          code: string
          created_at: string
          grid_ref: string | null
          id: string
          is_active: boolean
          name_en: string | null
          name_th: string
          parent_id: string | null
          role_level: Database["public"]["Enums"]["role_of_care"]
        }
        Insert: {
          bed_available?: number | null
          code: string
          created_at?: string
          grid_ref?: string | null
          id?: string
          is_active?: boolean
          name_en?: string | null
          name_th: string
          parent_id?: string | null
          role_level: Database["public"]["Enums"]["role_of_care"]
        }
        Update: {
          bed_available?: number | null
          code?: string
          created_at?: string
          grid_ref?: string | null
          id?: string
          is_active?: boolean
          name_en?: string | null
          name_th?: string
          parent_id?: string | null
          role_level?: Database["public"]["Enums"]["role_of_care"]
        }
        Relationships: [
          {
            foreignKeyName: "unit_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle: {
        Row: {
          call_sign: string
          created_at: string
          crew_note: string | null
          id: string
          status: Database["public"]["Enums"]["vehicle_status"]
          type: Database["public"]["Enums"]["vehicle_type"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          call_sign: string
          created_at?: string
          crew_note?: string | null
          id?: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          type?: Database["public"]["Enums"]["vehicle_type"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          call_sign?: string
          created_at?: string
          crew_note?: string | null
          id?: string
          status?: Database["public"]["Enums"]["vehicle_status"]
          type?: Database["public"]["Enums"]["vehicle_type"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_case_metrics: {
        Row: {
          case_code: string | null
          first_requested_at: string | null
          id: string | null
          last_handover_at: string | null
          leg_count: number | null
          origin_unit_id: string | null
          precedence: Database["public"]["Enums"]["precedence_level"] | null
          status: Database["public"]["Enums"]["case_status"] | null
          total_evacuation_time: string | null
          triage: Database["public"]["Enums"]["triage_color"] | null
        }
        Relationships: [
          {
            foreignKeyName: "case_origin_unit_id_fkey"
            columns: ["origin_unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
        ]
      }
      v_casualty_report: {
        Row: {
          case_code: string | null
          closed_at: string | null
          final_receiving_facility: string | null
          first_receiving_facility: string | null
          incident: string | null
          injury_level: Database["public"]["Enums"]["triage_color"] | null
          operation_type: string | null
          origin_unit: string | null
          patient_name: string | null
          precedence: Database["public"]["Enums"]["precedence_level"] | null
          requested_at: string | null
          service_date: string | null
          status: Database["public"]["Enums"]["case_status"] | null
          symptoms: string | null
        }
        Relationships: []
      }
      v_leg_metrics: {
        Row: {
          case_id: string | null
          dispatch_to_scene: string | null
          from_unit_id: string | null
          id: string | null
          leg_no: number | null
          leg_total: string | null
          precedence: Database["public"]["Enums"]["precedence_level"] | null
          request_to_dispatch: string | null
          role_level: Database["public"]["Enums"]["role_of_care"] | null
          scene_to_handover: string | null
          service_date: string | null
          to_unit_id: string | null
          triage: Database["public"]["Enums"]["triage_color"] | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_leg_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "v_case_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_leg_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "unit"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_see_case: { Args: { c_id: string }; Returns: boolean }
      create_evac_request: {
        Args: {
          p_avpu?: Database["public"]["Enums"]["avpu_level"]
          p_chief_complaint: string
          p_client_uuid?: string
          p_dbp?: number
          p_findings?: string
          p_gcs?: number
          p_mechanism?: string
          p_nbc_status?: Database["public"]["Enums"]["nbc_status"]
          p_patient_alias?: string
          p_patient_count?: number
          p_patient_mobility?: Database["public"]["Enums"]["patient_mobility"]
          p_pickup_marking?: string
          p_pickup_point_id?: string
          p_precedence: Database["public"]["Enums"]["precedence_level"]
          p_pulse?: number
          p_report_category?: Database["public"]["Enums"]["report_category"]
          p_resp_rate?: number
          p_sbp?: number
          p_security_status?: Database["public"]["Enums"]["security_status"]
          p_spo2?: number
          p_symptom_onset_at?: string
          p_to_unit_id: string
          p_transport_mode?: Database["public"]["Enums"]["transport_mode"]
          p_triage?: Database["public"]["Enums"]["triage_color"]
        }
        Returns: {
          case_code: string
          case_id: string
          leg_id: string
        }[]
      }
      current_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      current_unit_id: { Args: never; Returns: string }
      has_role: {
        Args: { r: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      next_case_code: { Args: never; Returns: string }
    }
    Enums: {
      app_role:
        | "sender"
        | "transporter"
        | "receiver"
        | "monitor"
        | "commander"
        | "admin"
      assessment_kind: "initial" | "enroute" | "handover"
      avpu_level: "alert" | "voice" | "pain" | "unresponsive"
      case_outcome: "recovered" | "hospitalized" | "died"
      case_status: "requested" | "active" | "completed" | "cancelled"
      disposition_route: "evac_chain" | "civilian_hospital" | "returned_to_unit"
      leg_status:
        | "pending"
        | "dispatched"
        | "on_scene"
        | "in_transit"
        | "arrived"
        | "completed"
        | "cancelled"
      nbc_status: "none" | "suspected" | "confirmed"
      patient_mobility:
        | "litter_dependent"
        | "litter_assisted"
        | "ambulatory"
        | "psych_escort"
        | "psych_no_escort"
      precedence_level: "urgent" | "priority" | "routine"
      rank_group: "officer" | "nco" | "enlisted" | "volunteer"
      report_category:
        | "combat_gunshot"
        | "combat_explosive"
        | "combat_mine"
        | "combat_other"
        | "combat_accident"
        | "noncombat_injury"
        | "illness_respiratory"
        | "illness_gi"
        | "illness_malaria"
        | "illness_std"
        | "illness_other"
      role_of_care: "role_1" | "role_2" | "role_3" | "role_4"
      security_status: "secure" | "possible_contact" | "active_contact"
      transport_mode: "ground" | "rotary" | "fixed_wing" | "watercraft"
      triage_color: "black" | "red" | "yellow" | "green"
      tx_code:
        | "tourniquet"
        | "hemostatic"
        | "wound_dressing"
        | "splint"
        | "airway"
        | "chest_seal"
        | "needle_decompression"
        | "chest_tube"
        | "oxygen"
        | "iv_fluid"
        | "analgesic"
        | "antibiotic"
        | "txa"
        | "other"
      vehicle_status:
        | "available"
        | "dispatched"
        | "busy"
        | "maintenance"
        | "offline"
      vehicle_type: "bls" | "als" | "utility" | "rotary" | "fixed_wing"
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
  public: {
    Enums: {
      app_role: [
        "sender",
        "transporter",
        "receiver",
        "monitor",
        "commander",
        "admin",
      ],
      assessment_kind: ["initial", "enroute", "handover"],
      avpu_level: ["alert", "voice", "pain", "unresponsive"],
      case_outcome: ["recovered", "hospitalized", "died"],
      case_status: ["requested", "active", "completed", "cancelled"],
      disposition_route: [
        "evac_chain",
        "civilian_hospital",
        "returned_to_unit",
      ],
      leg_status: [
        "pending",
        "dispatched",
        "on_scene",
        "in_transit",
        "arrived",
        "completed",
        "cancelled",
      ],
      nbc_status: ["none", "suspected", "confirmed"],
      patient_mobility: [
        "litter_dependent",
        "litter_assisted",
        "ambulatory",
        "psych_escort",
        "psych_no_escort",
      ],
      precedence_level: ["urgent", "priority", "routine"],
      rank_group: ["officer", "nco", "enlisted", "volunteer"],
      report_category: [
        "combat_gunshot",
        "combat_explosive",
        "combat_mine",
        "combat_other",
        "combat_accident",
        "noncombat_injury",
        "illness_respiratory",
        "illness_gi",
        "illness_malaria",
        "illness_std",
        "illness_other",
      ],
      role_of_care: ["role_1", "role_2", "role_3", "role_4"],
      security_status: ["secure", "possible_contact", "active_contact"],
      transport_mode: ["ground", "rotary", "fixed_wing", "watercraft"],
      triage_color: ["black", "red", "yellow", "green"],
      tx_code: [
        "tourniquet",
        "hemostatic",
        "wound_dressing",
        "splint",
        "airway",
        "chest_seal",
        "needle_decompression",
        "chest_tube",
        "oxygen",
        "iv_fluid",
        "analgesic",
        "antibiotic",
        "txa",
        "other",
      ],
      vehicle_status: [
        "available",
        "dispatched",
        "busy",
        "maintenance",
        "offline",
      ],
      vehicle_type: ["bls", "als", "utility", "rotary", "fixed_wing"],
    },
  },
} as const
