--- === SwarmSync ===
---
--- Automatically sync Swarm checkins to Day One journal
---
--- Download: https://github.com/jplaut/dayone-swarm-bridge
--- 
--- This Spoon automatically syncs your Swarm/Foursquare checkins to Day One when you:
--- - Connect to WiFi/Ethernet
--- - Wake from sleep
---
--- Configuration:
--- - Set `SwarmSync.projectPath` to your dayone-swarm-bridge installation path
--- - Set `SwarmSync.nodePath` to your Node.js binary path
--- - Optionally customize `SwarmSync.cooldown` (default: 300 seconds)

local obj = {}
obj.__index = obj

-- Metadata
obj.name = "SwarmSync"
obj.version = "1.0.0"
obj.author = "Jon Plaut"
obj.homepage = "https://github.com/jplaut/dayone-swarm-bridge"
obj.license = "MIT - https://opensource.org/licenses/MIT"

-- Configuration
obj.projectPath = nil  -- REQUIRED: Path to dayone-swarm-bridge installation
obj.nodePath = "/usr/local/bin/node"  -- Path to Node.js binary
obj.cooldown = 300  -- Cooldown period in seconds (5 minutes)

-- Internal state
obj.lastSyncTime = 0
obj.reachabilityWatcher = nil
obj.caffeineWatcher = nil
obj.wasReachable = false

--- SwarmSync:init()
--- Method
--- Initializes the Spoon
---
--- Parameters:
---  * None
---
--- Returns:
---  * The SwarmSync object
function obj:init()
    return self
end

--- SwarmSync:start()
--- Method
--- Starts the automatic sync watchers
---
--- Parameters:
---  * None
---
--- Returns:
---  * The SwarmSync object
function obj:start()
    if not self.projectPath then
        hs.notify.new({
            title = "SwarmSync Error",
            informativeText = "projectPath not configured. Please set SwarmSync.projectPath in your config."
        }):send()
        print("SwarmSync: ERROR - projectPath not set")
        return self
    end

    -- Start network reachability watcher
    self:startReachabilityWatcher()
    
    -- Start wake from sleep watcher
    self:startCaffeineWatcher()
    
    print("SwarmSync: Started")
    print("SwarmSync: Sync will run when:")
    print("  - Connecting to network (WiFi/Ethernet)")
    print("  - Waking from sleep")
    
    return self
end

--- SwarmSync:stop()
--- Method
--- Stops the automatic sync watchers
---
--- Parameters:
---  * None
---
--- Returns:
---  * The SwarmSync object
function obj:stop()
    if self.reachabilityWatcher then
        self.reachabilityWatcher:stop()
        self.reachabilityWatcher = nil
    end
    
    if self.caffeineWatcher then
        self.caffeineWatcher:stop()
        self.caffeineWatcher = nil
    end
    
    print("SwarmSync: Stopped")
    return self
end

--- SwarmSync:sync()
--- Method
--- Manually trigger a sync
---
--- Parameters:
---  * None
---
--- Returns:
---  * The SwarmSync object
function obj:sync()
    self:runSync()
    return self
end

--- SwarmSync:bindHotkeys(mapping)
--- Method
--- Binds hotkeys for the Spoon
---
--- Parameters:
---  * mapping - A table containing hotkey modifier/key details for the following items:
---   * sync - Manually trigger a sync
---
--- Returns:
---  * The SwarmSync object
function obj:bindHotkeys(mapping)
    local def = {
        sync = hs.fnutils.partial(self.sync, self)
    }
    hs.spoons.bindHotkeysToSpec(def, mapping)
    return self
end

-- Internal methods

function obj:runSync()
    local currentTime = os.time()
    
    -- Check if we're within cooldown period
    if currentTime - self.lastSyncTime < self.cooldown then
        print("SwarmSync: Sync skipped (cooldown period)")
        return
    end
    
    self.lastSyncTime = currentTime
    
    print("SwarmSync: Running sync...")
    
    local logFile = self.projectPath .. "/logs/sync.log"
    local command = string.format(
        'export PATH="/usr/local/bin:$PATH" && cd "%s" && "%s" src/sync.js >> "%s" 2>&1',
        self.projectPath,
        self.nodePath,
        logFile
    )
    
    hs.task.new("/bin/bash", function(exitCode, stdOut, stdErr)
        if exitCode == 0 then
            print("SwarmSync: Sync completed successfully")
            hs.notify.new({
                title = "Swarm Sync",
                informativeText = "Checkins synced to Day One"
            }):send()
        else
            print("SwarmSync: Sync failed with exit code: " .. exitCode)
            hs.notify.new({
                title = "Swarm Sync Failed",
                informativeText = "Check logs for details"
            }):send()
        end
    end, {"-c", command}):start()
end

function obj:startReachabilityWatcher()
    local function reachabilityCallback(self_watcher, flags)
        local reachableFlag = hs.network.reachability.flags.reachable
        local isReachable = (flags & reachableFlag) > 0
        
        -- Check if we're on cellular (if the flag exists)
        local isWWAN = false
        if hs.network.reachability.flags.isWWAN then
            isWWAN = (flags & hs.network.reachability.flags.isWWAN) > 0
        end
        
        -- We're interested in WiFi/Ethernet connections (not cellular)
        local isConnected = isReachable and not isWWAN
        
        if isConnected and not obj.wasReachable then
            -- Just connected to network
            print("SwarmSync: Network connected (WiFi/Ethernet)")
            
            -- Wait 5 seconds for network to stabilize
            hs.timer.doAfter(5, function()
                obj:runSync()
            end)
        elseif not isConnected and obj.wasReachable then
            -- Disconnected from network
            print("SwarmSync: Network disconnected")
        end
        
        obj.wasReachable = isConnected
    end
    
    self.reachabilityWatcher = hs.network.reachability.internet()
    self.reachabilityWatcher:setCallback(reachabilityCallback)
    self.reachabilityWatcher:start()
end

function obj:startCaffeineWatcher()
    local function caffeineCallback(eventType)
        if eventType == hs.caffeinate.watcher.systemDidWake then
            print("SwarmSync: System woke from sleep")
            
            -- Wait 10 seconds for network to be ready
            hs.timer.doAfter(10, function()
                obj:runSync()
            end)
        end
    end
    
    self.caffeineWatcher = hs.caffeinate.watcher.new(caffeineCallback)
    self.caffeineWatcher:start()
end

return obj
