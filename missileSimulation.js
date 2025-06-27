// Ensure THREE is available. In a typical web project, you'd import it,
// but for a script tag setup, it's globally available if the library is loaded first.

class MissileSimulation {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Error: Container with ID '${containerId}' not found. Please ensure your HTML has this element.`);
            return; // Stop initialization if container is missing
        }

        this.isRunning = false;
        this.frame = 0;
        this.maxFrame = 200; // Total animation frames

        this.initScene();
        this.computeTrajectories();
        this.setupControls();

        // Initial render to show the scene before animation starts
        this.renderer.render(this.scene, this.camera);
        console.log('Missile Simulation initialized and ready.');
    }

    initScene() {
        const W = this.container.clientWidth;
        const H = this.container.clientHeight;

        if (W === 0 || H === 0) {
            console.warn("Warning: Simulation container has zero width or height. Rendering might be invisible. Check your CSS.");
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, W / H, 1, 1000);
        this.camera.position.set(150, 150, 300); // Set camera position for good overview

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(W, H);
        this.renderer.setClearColor(0x000000, 0.3); // Semi-transparent black background
        this.container.appendChild(this.renderer.domElement);

        // Add OrbitControls for user interaction (pan, zoom, rotate)
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true; // For smoother camera movement
        this.controls.dampingFactor = 0.25;
        this.controls.screenSpacePanning = false;
        this.controls.maxPolarAngle = Math.PI / 2; // Prevent camera from going below ground

        // Add event listener for window resize to keep the simulation responsive
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(100, 100, 100);
        this.scene.add(directionalLight);

        // City (Origin)
        const cityGeom = new THREE.SphereGeometry(5, 16, 16);
        const cityMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const city = new THREE.Mesh(cityGeom, cityMat);
        city.position.set(0, 0, 0);
        this.scene.add(city);

        // Base A (Jeonju University Main Gate) - Larger
        const baseGeom = new THREE.SphereGeometry(6, 16, 16);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x0000ff });
        this.base = new THREE.Mesh(baseGeom, baseMat);
        this.base.position.set(50, 20, 0); // Base A's coordinates
        this.scene.add(this.base);

        // Coordinate Axes Helper
        const axesHelper = new THREE.AxesHelper(50); // Length of axes
        this.scene.add(axesHelper);

        // Grid Helper (Ground plane)
        const gridHelper = new THREE.GridHelper(300, 30); // Size and divisions
        gridHelper.position.y = -10; // Position slightly below the origin
        this.scene.add(gridHelper);

        console.log('Scene initialization complete.');
    }

    onWindowResize() {
        const W = this.container.clientWidth;
        const H = this.container.clientHeight;
        this.camera.aspect = W / H;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(W, H);
        this.renderer.render(this.scene, this.camera); // Re-render after resize
    }

    computeTrajectories() {
        const vI = 120; // Interceptor missile speed
        const SA = this.base.position.clone(); // Base A position

        // Enemy missile trajectory function, aiming towards SA
        // This is a simplified ballistic trajectory.
        const PH1 = t => new THREE.Vector3(
            250 - 20 * t,
            300 - 25 * t,
            400 - 4.9 * t * t // Gravity effect
        );

        // Calculate impact time (tImpact) - where enemy missile can be intercepted
        // We find the time 't' when the distance from SA to PH1(t) equals vI * t.
        let tImpact = 0;
        let minErr = Infinity;

        // Approximate maximum time for the enemy missile to hit near the ground (z=0)
        const approxGroundImpactTime = Math.sqrt(400 / 4.9);

        // Search for tImpact within a reasonable time frame
        for (let t = 0; t <= approxGroundImpactTime + 5; t += 0.01) { // Search a bit past ground impact
            const P = PH1(t);
            const distanceRequired = P.distanceTo(SA);
            const distanceTraveledByInterceptor = vI * t;
            const err = Math.abs(distanceRequired - distanceTraveledByInterceptor);

            if (err < minErr) {
                minErr = err;
                tImpact = t;
            }
        }

        const Pimp = PH1(tImpact); // The calculated interception point
        const u = Pimp.clone().sub(SA).normalize(); // Direction vector for interceptor

        // Generate points for trajectories
        this.enemyPoints = [];
        this.intPoints = [];

        // Generate points up to the calculated impact time
        for (let i = 0; i <= this.maxFrame; i++) {
            const t = tImpact * i / this.maxFrame;
            this.enemyPoints.push(PH1(t));
            this.intPoints.push(SA.clone().add(u.clone().multiplyScalar(vI * t)));
        }

        // Create trajectory lines (using Line instead of LineBasicMaterial linewidth for better compatibility)
        // Note: linewidth in LineBasicMaterial is often ignored by WebGL renderers.
        // If thicker lines are critical and Line is not enough, you'd typically use TubeGeometry or a custom shader.
        const geomE = new THREE.BufferGeometry().setFromPoints(this.enemyPoints);
        const geomI = new THREE.BufferGeometry().setFromPoints(this.intPoints);

        this.enemyLine = new THREE.Line(
            geomE,
            new THREE.LineBasicMaterial({ color: 0xff6600 }) // Orange for enemy
        );
        this.intLine = new THREE.Line(
            geomI,
            new THREE.LineBasicMaterial({ color: 0x00ffff }) // Cyan for interceptor
        );

        // Initially hide trajectory lines; they will appear at animation start
        this.enemyLine.visible = false;
        this.intLine.visible = false;

        this.scene.add(this.enemyLine, this.intLine);

        // Create missile dots (spheres) - Larger for better visibility
        const dotGeom = new THREE.SphereGeometry(4, 8, 8); // Size 4
        this.enemyDot = new THREE.Mesh(
            dotGeom,
            new THREE.MeshStandardMaterial({ color: 0xff0000 }) // Red for enemy
        );
        this.intDot = new THREE.Mesh(
            dotGeom,
            new THREE.MeshStandardMaterial({ color: 0x0000ff }) // Blue for interceptor
        );

        // Set initial positions for missile dots
        this.enemyDot.position.copy(this.enemyPoints[0]);
        this.intDot.position.copy(this.intPoints[0]);

        this.scene.add(this.enemyDot, this.intDot);

        // Impact point sphere - visible only at the end of simulation
        const impactGeom = new THREE.SphereGeometry(8, 16, 16); // Larger impact sphere
        const impactMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.7
        });
        this.impactPoint = new THREE.Mesh(impactGeom, impactMat);
        this.impactPoint.position.copy(Pimp);
        this.impactPoint.visible = false; // Initially hidden
        this.scene.add(this.impactPoint);

        console.log(`Calculated Impact Time: ${tImpact.toFixed(2)} seconds`);
        console.log(`Calculated Impact Point: (${Pimp.x.toFixed(1)}, ${Pimp.y.toFixed(1)}, ${Pimp.z.toFixed(1)})`);
        console.log(`Base A (Launch Site) Position: (${SA.x}, ${SA.y}, ${SA.z})`);
    }

    setupControls() {
        const launchBtn = document.getElementById('launch-btn');
        const resetBtn = document.getElementById('reset-btn');

        if (launchBtn) {
            launchBtn.addEventListener('click', () => {
                console.log('Launch button clicked.');
                if (!this.isRunning) {
                    this.startSimulation();
                    launchBtn.disabled = true;
                    launchBtn.textContent = '🚀 Launching...';
                }
            });
        } else {
            console.warn("Launch button with ID 'launch-btn' not found in HTML.");
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                console.log('Reset button clicked.');
                this.resetSimulation();
                if (launchBtn) { // Re-enable launch button after reset
                    launchBtn.disabled = false;
                    launchBtn.textContent = '🚀 Launch Missile';
                }
            });
        } else {
            console.warn("Reset button with ID 'reset-btn' not found in HTML.");
        }
    }

    startSimulation() {
        console.log('Starting simulation...');
        this.isRunning = true;
        this.frame = 0;

        // Reset missile positions to start
        if (this.enemyDot && this.enemyPoints.length > 0) {
            this.enemyDot.position.copy(this.enemyPoints[0]);
            this.intDot.position.copy(this.intPoints[0]);
        }
        // Ensure missiles are visible at the start
        if (this.enemyDot) this.enemyDot.visible = true;
        if (this.intDot) this.intDot.visible = true;

        // Make trajectory lines visible at start
        if (this.enemyLine) this.enemyLine.visible = true;
        if (this.intLine) this.intLine.visible = true;

        // Hide impact point until collision occurs
        if (this.impactPoint) this.impactPoint.visible = false;

        this.animate(); // Start the animation loop
    }

    resetSimulation() {
        console.log('Resetting simulation...');
        this.isRunning = false; // Stop animation if running
        this.frame = 0; // Reset frame to 0

        // Reset missile positions to initial state
        if (this.enemyDot && this.enemyPoints.length > 0) {
            this.enemyDot.position.copy(this.enemyPoints[0]);
            this.intDot.position.copy(this.intPoints[0]);
        }
        // Ensure missiles are visible in their initial state
        if (this.enemyDot) this.enemyDot.visible = true;
        if (this.intDot) this.intDot.visible = true;

        // Hide trajectory lines on reset
        if (this.enemyLine) this.enemyLine.visible = false;
        if (this.intLine) this.intLine.visible = false;

        // Hide impact point on reset
        if (this.impactPoint) this.impactPoint.visible = false;

        this.renderer.render(this.scene, this.camera); // Render the reset scene
    }

    animate() {
        // Only continue animating if running or if we are still showing the last frame/impact
        if (!this.isRunning && this.frame > this.maxFrame + 60) { // Stop after 60 frames of impact effect
            return;
        }

        requestAnimationFrame(this.animate.bind(this)); // Bind 'this' for correct context

        // Update OrbitControls if enabled
        if (this.controls) {
            this.controls.update();
        }

        if (this.frame <= this.maxFrame) {
            // Update missile positions based on current frame
            const eP = this.enemyPoints[this.frame];
            const iP = this.intPoints[this.frame];

            if (eP && iP) {
                this.enemyDot.position.copy(eP);
                this.intDot.position.copy(iP);
            }

            // Log positions for debugging (can be removed for performance)
            if (eP && iP) {
                // console.log(`Frame ${this.frame}: Enemy (${eP.x.toFixed(1)}, ${eP.y.toFixed(1)}, ${eP.z.toFixed(1)}), Interceptor (${iP.x.toFixed(1)}, ${iP.y.toFixed(1)}, ${iP.z.toFixed(1)})`);
            }

            this.frame++;
        } else {
            // Simulation has reached or passed maxFrame (collision point)
            this.isRunning = false; // Stop internal simulation state

            // Show and animate impact point
            if (this.impactPoint) {
                this.impactPoint.visible = true;
                // Simple pulsating effect for impact point
                this.impactPoint.material.opacity = 0.3 + 0.4 * Math.sin(Date.now() * 0.005);
            }

            // After a short delay, reset buttons for next launch
            const launchBtn = document.getElementById('launch-btn');
            if (launchBtn && launchBtn.disabled) {
                // This part could be timed better, maybe with a setTimeout after impact effect
                // For now, it will keep updating until animate stops after maxFrame + 60
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}
