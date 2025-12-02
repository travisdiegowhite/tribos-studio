// Enhanced Context Collection for Better Route Quality
// Collects and manages detailed user preferences for AI route generation

import { supabase } from '../supabase';
import { getWeatherData } from './weather';

/**
 * Enhanced user context collection for better AI route generation
 */
export class EnhancedContextCollector {
  
  /**
   * Initialize user preferences if they don't exist
   */
  static async initializeUserPreferences(userId) {
    try {
      // Call the database function to initialize all preference tables
      const { error } = await supabase
        .rpc('initialize_user_preferences', { p_user_id: userId });
      
      if (error) {
        console.error('Error initializing user preferences:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize user preferences:', error);
      return false;
    }
  }
  
  /**
   * Collect detailed user preferences through progressive questioning
   */
  static async gatherDetailedPreferences(userId, baseParams) {
    // Ensure preferences exist
    await this.initializeUserPreferences(userId);
    
    const context = {
      ...baseParams,
      // Get all preferences from database
      routingPreferences: await this.getRoutingPreferences(userId),
      surfacePreferences: await this.getSurfacePreferences(userId),
      safetyPreferences: await this.getSafetyPreferences(userId),
      scenicPreferences: await this.getScenicPreferences(userId),
      trainingContext: await this.getTrainingContext(userId),
      localKnowledge: await this.getLocalKnowledge(baseParams.startLocation, userId)
    };
    
    return context;
  }

  /**
   * Get detailed routing preferences from database
   */
  static async getRoutingPreferences(userId) {
    try {
      const { data, error } = await supabase
        .from('routing_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error || !data) {
        // Return defaults if no preferences found
        return this.getDefaultRoutingPreferences();
      }
      
      return {
        trafficTolerance: data.traffic_tolerance,
        hillPreference: data.hill_preference,
        distanceFromTraffic: data.distance_from_traffic,
        preferredRoadTypes: data.preferred_road_types,
        avoidedRoadTypes: data.avoided_road_types,
        intersectionComplexity: data.intersection_complexity,
        turningPreference: data.turning_preference,
        loopVsOutBack: data.route_type_preference,
        maxGradientComfort: data.max_gradient_comfort
      };
    } catch (error) {
      console.error('Error fetching routing preferences:', error);
      return this.getDefaultRoutingPreferences();
    }
  }
  
  /**
   * Get default routing preferences
   */
  static getDefaultRoutingPreferences() {
    return {
      trafficTolerance: 'low',
      hillPreference: 'moderate',
      distanceFromTraffic: 500,
      preferredRoadTypes: ['residential', 'bike_path', 'quiet_road'],
      avoidedRoadTypes: ['highway', 'busy_arterial'],
      intersectionComplexity: 'simple',
      turningPreference: 'minimal_turns',
      loopVsOutBack: 'flexible',
      maxGradientComfort: 10
    };
  }

  /**
   * Get surface type preferences from database
   */
  static async getSurfacePreferences(userId) {
    try {
      const { data, error } = await supabase
        .from('surface_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error || !data) {
        return this.getDefaultSurfacePreferences();
      }
      
      return {
        primarySurfaces: data.primary_surfaces,
        surfaceQuality: data.surface_quality,
        gravelTolerance: data.gravel_tolerance,
        singleTrackExperience: data.single_track_experience,
        weatherSurfaceAdjustment: data.weather_surface_adjustment,
        wetWeatherPavedOnly: data.wet_weather_paved_only
      };
    } catch (error) {
      console.error('Error fetching surface preferences:', error);
      return this.getDefaultSurfacePreferences();
    }
  }
  
  /**
   * Get default surface preferences
   */
  static getDefaultSurfacePreferences() {
    return {
      primarySurfaces: ['paved_road', 'bike_path'],
      surfaceQuality: 'good',
      gravelTolerance: 0.1,
      singleTrackExperience: 'none',
      weatherSurfaceAdjustment: true,
      wetWeatherPavedOnly: true
    };
  }

  /**
   * Get safety and comfort preferences
   */
  static async getSafetyPreferences(userId) {
    try {
      const { data, error } = await supabase
        .from('safety_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error || !data) {
        return this.getDefaultSafetyPreferences();
      }
      
      return {
        lightingRequirement: data.lighting_requirement,
        shoulderWidth: data.shoulder_width,
        bikeInfrastructure: data.bike_infrastructure,
        emergencyAccess: data.emergency_access,
        cellCoverage: data.cell_coverage,
        restStopFrequency: data.rest_stop_frequency,
        mechanicalSupport: data.mechanical_support,
        groupRiding: data.group_riding,
        groupSize: data.group_size
      };
    } catch (error) {
      console.error('Error fetching safety preferences:', error);
      return this.getDefaultSafetyPreferences();
    }
  }
  
  /**
   * Get default safety preferences
   */
  static getDefaultSafetyPreferences() {
    return {
      lightingRequirement: 'not_required',
      shoulderWidth: 'preferred',
      bikeInfrastructure: 'strongly_preferred',
      emergencyAccess: 'good',
      cellCoverage: 'important',
      restStopFrequency: 15,
      mechanicalSupport: 'basic',
      groupRiding: false,
      groupSize: 1
    };
  }

  /**
   * Get scenic and enjoyment preferences
   */
  static async getScenicPreferences(userId) {
    try {
      const { data, error } = await supabase
        .from('scenic_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error || !data) {
        return this.getDefaultScenicPreferences();
      }
      
      return {
        scenicImportance: data.scenic_importance,
        preferredViews: data.preferred_views,
        avoidedViews: data.avoided_views,
        culturalInterests: data.cultural_interests,
        photographyStops: data.photography_stops,
        scenicDetours: data.scenic_detours,
        quietnessLevel: data.quietness_level,
        varietyImportance: data.variety_importance
      };
    } catch (error) {
      console.error('Error fetching scenic preferences:', error);
      return this.getDefaultScenicPreferences();
    }
  }
  
  /**
   * Get default scenic preferences
   */
  static getDefaultScenicPreferences() {
    return {
      scenicImportance: 'important',
      preferredViews: ['nature', 'water', 'rolling_hills'],
      avoidedViews: ['industrial'],
      culturalInterests: ['historic_sites', 'cafes'],
      photographyStops: true,
      scenicDetours: true,
      quietnessLevel: 'high',
      varietyImportance: 'medium'
    };
  }

  /**
   * Get current training context
   */
  static async getTrainingContext(userId) {
    try {
      const { data, error } = await supabase
        .from('training_context')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error || !data) {
        return this.getDefaultTrainingContext();
      }
      
      return {
        currentTrainingPhase: data.current_phase,
        weeklyVolume: data.weekly_volume_km,
        weeklyRides: data.weekly_rides,
        longestRecentRide: data.longest_recent_ride,
        recentIntensity: data.recent_intensity,
        fatigueLevel: data.fatigue_level,
        primaryGoal: data.primary_goal,
        upcomingEventDate: data.upcoming_event_date,
        upcomingEventType: data.upcoming_event_type,
        injuryAreas: data.injury_areas || [],
        recoveryFocus: data.recovery_focus || [],
        typicalRideTime: data.typical_ride_time,
        timeFlexibility: data.time_flexibility,
        equipmentStatus: data.equipment_status
      };
    } catch (error) {
      console.error('Error fetching training context:', error);
      return this.getDefaultTrainingContext();
    }
  }
  
  /**
   * Get default training context
   */
  static getDefaultTrainingContext() {
    return {
      currentTrainingPhase: 'base_building',
      weeklyVolume: 100,
      weeklyRides: 3,
      longestRecentRide: null,
      recentIntensity: 'moderate',
      fatigueLevel: 'fresh',
      primaryGoal: 'fitness',
      upcomingEventDate: null,
      upcomingEventType: null,
      injuryAreas: [],
      recoveryFocus: [],
      typicalRideTime: 60,
      timeFlexibility: 'moderate',
      equipmentStatus: 'good'
    };
  }

  /**
   * Gather local knowledge and constraints
   */
  static async getLocalKnowledge(startLocation, userId) {
    return {
      // Weather-specific local knowledge
      windPatterns: await this.getLocalWindPatterns(startLocation),
      // Time-based considerations
      trafficPatterns: await this.getTrafficPatterns(startLocation),
      // User's familiarity with area
      areaFamiliarity: await this.getUserAreaFamiliarity(userId, startLocation),
      // Seasonal considerations
      seasonalConsiderations: await this.getSeasonalFactors(startLocation)
    };
  }

  /**
   * Build comprehensive AI prompt with enhanced context
   */
  static buildEnhancedRoutePrompt(enhancedContext) {
    const {
      startLocation: rawStartLocation,
      timeAvailable,
      trainingGoal,
      routeType,
      weatherData,
      ridingPatterns,
      targetDistance,
      routingPreferences,
      surfacePreferences,
      safetyPreferences,
      scenicPreferences,
      trainingContext,
      localKnowledge
    } = enhancedContext;

    // Normalize startLocation to array format [lng, lat]
    let startLocation = rawStartLocation;
    if (!Array.isArray(rawStartLocation) && typeof rawStartLocation === 'object') {
      const lng = rawStartLocation.lng ?? rawStartLocation.longitude ?? rawStartLocation.lon;
      const lat = rawStartLocation.lat ?? rawStartLocation.latitude;
      if (lng !== undefined && lat !== undefined) {
        startLocation = [lng, lat];
      }
    }

    // Validate startLocation
    if (!startLocation || !Array.isArray(startLocation) || startLocation.length < 2) {
      console.error('Invalid startLocation in buildEnhancedRoutePrompt:', rawStartLocation);
      throw new Error('Invalid startLocation format');
    }

    const [longitude, latitude] = startLocation;

    let prompt = `You are an expert cycling coach and route planner with deep local knowledge. Generate 3-4 intelligent cycling route suggestions with detailed waypoints based on comprehensive rider preferences.

LOCATION & CONSTRAINTS:
- Start coordinates: ${latitude}, ${longitude}
- Target distance: ${targetDistance.toFixed(1)}km
- Time available: ${timeAvailable} minutes
- Route type preference: ${routeType}

TRAINING CONTEXT:
- Primary goal: ${trainingGoal}
- Current training phase: ${trainingContext.currentTrainingPhase}
- Weekly volume: ${trainingContext.weeklyVolume}km
- Fatigue level: ${trainingContext.fatigueLevel}
- Recent intensity: ${trainingContext.recentIntensity}

ROUTING PREFERENCES:
- Traffic tolerance: ${routingPreferences.trafficTolerance}
- Hill preference: ${routingPreferences.hillPreference}
- Max comfortable gradient: ${routingPreferences.maxGradientComfort}%
- Preferred road types: ${routingPreferences.preferredRoadTypes.join(', ')}
- Turn complexity preference: ${routingPreferences.turningPreference}
- Distance from major roads: ${routingPreferences.distanceFromTraffic}m minimum

SURFACE & SAFETY:
- Primary surfaces: ${surfacePreferences.primarySurfaces.join(', ')}
- Surface quality requirement: ${surfacePreferences.surfaceQuality}
- Gravel tolerance: ${(surfacePreferences.gravelTolerance * 100).toFixed(0)}% of route
- Bike infrastructure importance: ${safetyPreferences.bikeInfrastructure}${
  safetyPreferences.bikeInfrastructure === 'required' ? ' (MANDATORY - ONLY USE BIKE LANES/PATHS)' : ''
}
- Shoulder width: ${safetyPreferences.shoulderWidth}
- Rest stop frequency: every ${safetyPreferences.restStopFrequency}km

SCENIC & ENJOYMENT:
- Scenic importance: ${scenicPreferences.scenicImportance}
- Preferred views: ${scenicPreferences.preferredViews.join(', ')}
- Quietness preference: ${scenicPreferences.quietnessLevel}
- Cultural interests: ${scenicPreferences.culturalInterests.join(', ')}
- Photography stops: ${scenicPreferences.photographyStops ? 'yes' : 'no'}

WEATHER CONDITIONS:`;

    if (weatherData) {
      prompt += `
- Temperature: ${weatherData.temperature}°C
- Wind: ${weatherData.windSpeed} km/h from ${weatherData.windDirection}
- Conditions: ${weatherData.description}
- Surface impact: ${this.assessWeatherSurfaceImpact(weatherData, surfacePreferences)}`;
    }

    // Add local knowledge
    if (localKnowledge?.windPatterns) {
      prompt += `\n- Local wind patterns: ${localKnowledge.windPatterns}`;
    }

    prompt += `

DETAILED WAYPOINT REQUIREMENTS:
Please provide routes with comprehensive waypoint information including:

1. Strategic waypoints every 3-5km with specific landmarks or intersections
2. Surface type changes and quality notes
3. Elevation change warnings (climbs >50m elevation gain)
4. Traffic density changes and road type transitions
5. Rest stop opportunities (cafes, parks, facilities)
6. Scenic highlights and photo opportunities
7. Navigation complexity notes (tricky turns, unmarked roads)
8. Safety considerations (busy intersections, narrow sections)

FORMAT YOUR RESPONSE AS JSON:
{
  "routes": [
    {
      "name": "descriptive route name reflecting key features",
      "description": "detailed description explaining route highlights and why it fits preferences",
      "estimatedDistance": distance_in_km,
      "estimatedElevation": elevation_gain_in_meters,
      "difficulty": "easy|moderate|hard",
      "surfaceBreakdown": {
        "paved_road": percentage,
        "bike_path": percentage,
        "gravel": percentage
      },
      "detailedWaypoints": [
        {
          "point": [lng, lat],
          "description": "specific landmark or intersection",
          "distanceFromStart": km_from_start,
          "elevation": meters_above_sea_level,
          "surface": "surface_type",
          "roadType": "road_classification",
          "trafficLevel": "low|medium|high",
          "safetyNotes": "any safety considerations",
          "amenities": ["cafe", "restroom", "bike_shop"],
          "scenicValue": "scenic_rating_and_description"
        }
      ],
      "keyDirections": ["turn by turn directions with landmarks"],
      "trainingFocus": "how this route serves the training goal",
      "weatherOptimization": "how route works with current conditions",
      "safetyRating": "1-5 scale with explanation",
      "scenicRating": "1-5 scale with highlights",
      "estimatedTime": time_in_minutes,
      "restStops": ["planned rest stop locations with facilities"],
      "alternativeOptions": ["shorter/longer variants or bad weather alternatives"]
    }
  ]
}

CRITICAL REQUIREMENTS:
- Prioritize rider safety above all else
- Ensure routes match specified surface and traffic preferences${
  safetyPreferences.bikeInfrastructure === 'required' ? `
- MANDATORY: Route MUST use ONLY dedicated bike lanes, bike paths, or protected cycling infrastructure
- DO NOT include any road segments without bike infrastructure
- Each waypoint MUST be on a bike path or protected bike lane
- If insufficient bike infrastructure exists, clearly state this limitation` : 
  safetyPreferences.bikeInfrastructure === 'strongly_preferred' ? `
- STRONGLY prioritize bike lanes, paths, and cycling infrastructure (80%+ of route)
- Minimize segments without bike infrastructure` : ''
}
- Provide waypoints with enough detail for confident navigation
- Consider local traffic patterns and infrastructure
- Balance training goals with scenic and enjoyment factors
- Include practical considerations (facilities, weather adaptations)
${safetyPreferences.bikeInfrastructure === 'required' || safetyPreferences.bikeInfrastructure === 'strongly_preferred' ? `

INFRASTRUCTURE VALIDATION:
For each waypoint, specify:
- Infrastructure type: "bike_path", "bike_lane", "shared_path", "road_with_shoulder", or "road_no_infrastructure"
- If no bike infrastructure available, mark as "CAUTION: No bike infrastructure"` : ''}`;

    return prompt;
  }

  /**
   * Assess how weather affects surface preferences
   */
  static assessWeatherSurfaceImpact(weatherData, surfacePreferences) {
    if (!weatherData) return 'Normal surface preferences apply';
    
    const desc = weatherData.description?.toLowerCase() || '';
    
    if (desc.includes('rain') || desc.includes('wet')) {
      if (surfacePreferences.wetWeatherPavedOnly) {
        return 'Avoid all unpaved surfaces due to wet conditions';
      }
      return 'Avoid gravel/unpaved due to rain, prioritize paved surfaces';
    }
    
    if (weatherData.temperature < 5) {
      return 'Ice possible on shaded surfaces, prefer sun-exposed roads';
    }
    
    if (weatherData.windSpeed > 25) {
      return 'Seek sheltered routes, avoid exposed areas';
    }
    
    return 'Normal surface preferences apply';
  }

  // Helper methods for gathering local data
  static async getLocalWindPatterns(location) {
    // In a production app, this could integrate with historical weather APIs
    const hour = new Date().getHours();
    
    if (hour < 10) {
      return "Morning: typically calm, valleys may have fog";
    } else if (hour < 14) {
      return "Midday: building thermal winds, crosswinds on exposed roads";
    } else if (hour < 18) {
      return "Afternoon: strongest winds, seek sheltered routes";
    } else {
      return "Evening: calming winds, good conditions";
    }
  }

  static async getTrafficPatterns(location) {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    
    if (day === 0 || day === 6) {
      return "Weekend: lighter traffic, popular cycling routes may be busier";
    }
    
    if (hour >= 7 && hour <= 9) {
      return "Morning rush hour: avoid main commuter routes";
    } else if (hour >= 16 && hour <= 18) {
      return "Evening rush hour: heavy traffic on arterials";
    } else if (hour >= 10 && hour <= 15) {
      return "Midday: moderate traffic, good cycling conditions";
    } else {
      return "Off-peak: light traffic, quieter roads";
    }
  }

  static async getUserAreaFamiliarity(userId, location) {
    try {
      // Check user's ride history near this location
      const { data: routes, error } = await supabase
        .from('routes')
        .select('id, start_latitude, start_longitude')
        .eq('user_id', userId);
      
      if (error || !routes) {
        return {
          familiarityLevel: 'new',
          previousRides: 0,
          knownHazards: [],
          favoriteSegments: []
        };
      }
      
      // Count rides within 10km of current location
      const nearbyRides = routes.filter(route => {
        if (!route.start_latitude || !route.start_longitude) return false;
        
        const distance = this.calculateDistance(
          location[1], location[0],
          route.start_latitude, route.start_longitude
        );
        
        return distance < 10; // within 10km
      });
      
      let familiarityLevel = 'new';
      if (nearbyRides.length > 20) familiarityLevel = 'high';
      else if (nearbyRides.length > 10) familiarityLevel = 'moderate';
      else if (nearbyRides.length > 3) familiarityLevel = 'low';
      
      return {
        familiarityLevel,
        previousRides: nearbyRides.length,
        knownHazards: [], // Could be expanded with actual hazard data
        favoriteSegments: [] // Could be expanded with segment analysis
      };
    } catch (error) {
      console.error('Error checking area familiarity:', error);
      return {
        familiarityLevel: 'new',
        previousRides: 0,
        knownHazards: [],
        favoriteSegments: []
      };
    }
  }
  
  static async getSeasonalFactors(location) {
    const month = new Date().getMonth();
    const season = month >= 2 && month <= 4 ? 'spring' :
                  month >= 5 && month <= 7 ? 'summer' :
                  month >= 8 && month <= 10 ? 'fall' : 'winter';
    
    const factors = {
      spring: "Variable conditions, possible rain, blooming scenery",
      summer: "Hot afternoons, seek shade, early morning rides recommended",
      fall: "Ideal temperatures, beautiful foliage, shorter daylight",
      winter: "Cold conditions, possible ice, reduced daylight hours"
    };
    
    return factors[season];
  }
  
  /**
   * Calculate distance between two points in km
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Update user preferences based on route selection
   */
  static async updatePreferencesFromRouteSelection(userId, selectedRoute, rejectedRoutes) {
    // This method would analyze what made the user select one route over others
    // and gradually adjust preferences to better match their choices
    console.log('Learning from route selection:', { selectedRoute, rejectedRoutes });
    
    // TODO: Implement preference learning algorithm
    // Could track things like:
    // - Did they pick the hillier or flatter route?
    // - Did they choose the scenic route over the direct one?
    // - Did they prefer bike paths over roads?
    
    return true;
  }

  /**
   * Get complete user preferences for display/editing
   */
  static async getCompletePreferences(userId) {
    // Check for demo mode first
    const { isDemoMode, demoPreferences } = await import('./demoData');
    if (isDemoMode() && userId === 'demo-user-id') {
      console.log('✅ Demo mode: returning mock preferences');
      return demoPreferences;
    }

    try {
      // Ensure preferences are initialized
      await this.initializeUserPreferences(userId);

      // Try to fetch from the complete view
      const { data, error } = await supabase
        .from('user_preferences_complete')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching complete preferences:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });

        // Fallback: build preferences from individual queries
        console.log('📋 Falling back to individual preference queries');
        return await this.buildCompletePreferencesFromTables(userId);
      }

      return data;
    } catch (error) {
      console.error('Failed to get complete preferences:', error);
      // Return default preferences structure
      return await this.buildCompletePreferencesFromTables(userId);
    }
  }

  /**
   * Build complete preferences object from individual table queries
   * Used as fallback when view query fails
   */
  static async buildCompletePreferencesFromTables(userId) {
    const [routing, surface, safety, scenic, training] = await Promise.all([
      this.getRoutingPreferences(userId),
      this.getSurfacePreferences(userId),
      this.getSafetyPreferences(userId),
      this.getScenicPreferences(userId),
      this.getTrainingContext(userId)
    ]);

    return {
      user_id: userId,
      // Routing preferences
      ...routing,
      // Surface preferences
      ...surface,
      // Safety preferences
      ...safety,
      // Scenic preferences
      ...scenic,
      // Training context
      ...training,
      // Metadata
      onboarding_completed: false,
      preferences_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Update specific preference category
   */
  static async updatePreferences(userId, category, updates) {
    const tableMap = {
      routing: 'routing_preferences',
      surface: 'surface_preferences',
      safety: 'safety_preferences',
      scenic: 'scenic_preferences',
      training: 'training_context'
    };
    
    const table = tableMap[category];
    if (!table) {
      console.error('Invalid preference category:', category);
      return false;
    }
    
    try {
      const { error } = await supabase
        .from(table)
        .update(updates)
        .eq('user_id', userId);
      
      if (error) {
        console.error(`Error updating ${category} preferences:`, error);
        return false;
      }
      
      // Log the change in preference history
      await this.logPreferenceChange(userId, category, updates);
      
      return true;
    } catch (error) {
      console.error(`Failed to update ${category} preferences:`, error);
      return false;
    }
  }
  
  /**
   * Log preference changes for analysis
   */
  static async logPreferenceChange(userId, preferenceType, changes) {
    try {
      const entries = Object.entries(changes).map(([key, value]) => ({
        user_id: userId,
        preference_type: preferenceType,
        preference_key: key,
        new_value: value,
        change_reason: 'user_update'
      }));
      
      const { error } = await supabase
        .from('preference_history')
        .insert(entries);
      
      if (error) {
        console.error('Error logging preference change:', error);
      }
    } catch (error) {
      console.error('Failed to log preference change:', error);
    }
  }
}

export default EnhancedContextCollector;