from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import csv
from datetime import datetime
import uuid
import urllib.parse
import re

class ArgumentSurveyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/save_response':
            try:
                # Read response data
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                response_data = json.loads(post_data.decode('utf-8'))
                
                # Create responses folder
                if not os.path.exists('responses'):
                    os.makedirs('responses')
                
                # Extract user info for filename
                user_info = response_data.get('userInfo', {})
                user_email = user_info.get('email', 'unknown')
                user_name = user_info.get('name', 'unknown')
                
                # Clean email for filename (replace special chars)
                clean_email = re.sub(r'[^\w\-_.]', '_', user_email)
                
                # Generate filename
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                unique_id = str(uuid.uuid4())[:8]
                filename = f'response_{clean_email}_{timestamp}_{unique_id}.json'
                filepath = os.path.join('responses', filename)
                
                # Prepare complete data for saving
                save_data = {
                    'timestamp': datetime.now().isoformat(),
                    'client_address': self.client_address[0],
                    'user_info': user_info,
                    'responses': response_data.get('responses', {}),
                    'survey_metadata': response_data.get('surveyMetadata', {}),
                    'response_count': len(response_data.get('responses', {}))
                }
                
                # Save JSON file
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(save_data, f, indent=2, ensure_ascii=False)
                
                # Also save to CSV for easier analysis
                self.save_to_csv(save_data, user_info)
                
                # Success response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                response = {
                    'success': True,
                    'message': 'Response saved successfully',
                    'filename': filename
                }
                self.wfile.write(json.dumps(response).encode())
                
                print(f'✓ Response saved: {filename}')
                print(f'  User: {user_name} ({user_email})')
                print(f'  Responses: {len(response_data.get("responses", {}))}')
                
            except Exception as e:
                print(f'❌ Error saving response: {e}')
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                error_response = {'success': False, 'error': str(e)}
                self.wfile.write(json.dumps(error_response).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def save_to_csv(self, save_data, user_info):
        """Save responses to CSV format for easier analysis"""
        try:
            csv_path = os.path.join('responses', 'all_responses.csv')
            
            # Prepare row data
            responses = save_data.get('responses', {})
            row_data = {
                'timestamp': save_data['timestamp'],
                'user_name': user_info.get('name', ''),
                'user_email': user_info.get('email', ''),
                'user_affiliation': user_info.get('affiliation', ''),
                'client_ip': save_data['client_address'],
                'response_count': save_data['response_count']
            }
            
            # Add all responses as columns
            for key, value in responses.items():
                row_data[key] = value
            
            # Check if CSV exists to determine if we need headers
            file_exists = os.path.exists(csv_path)
            
            with open(csv_path, 'a', newline='', encoding='utf-8') as csvfile:
                if row_data:
                    writer = csv.DictWriter(csvfile, fieldnames=row_data.keys())
                    
                    # Write header if file is new
                    if not file_exists:
                        writer.writeheader()
                    
                    writer.writerow(row_data)
            
            print(f'✓ Also saved to CSV: all_responses.csv')
            
        except Exception as e:
            print(f'❌ CSV save error: {e}')
    
    def do_GET(self):
        if self.path == '/':
            self.path = '/index.html'
        
        try:
            file_path = self.path[1:]  # Remove leading '/'
            
            # Handle data folder requests
            if file_path.startswith('data/'):
                if os.path.exists(file_path):
                    self.send_response(200)
                    
                    if file_path.endswith('.csv'):
                        self.send_header('Content-Type', 'text/csv')
                    else:
                        self.send_header('Content-Type', 'text/plain')
                    
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    
                    with open(file_path, 'rb') as f:
                        self.wfile.write(f.read())
                    return
            
            # Handle regular files
            if os.path.exists(file_path):
                self.send_response(200)
                
                if file_path.endswith('.html'):
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                elif file_path.endswith('.js'):
                    self.send_header('Content-Type', 'application/javascript; charset=utf-8')
                elif file_path.endswith('.css'):
                    self.send_header('Content-Type', 'text/css; charset=utf-8')
                else:
                    self.send_header('Content-Type', 'text/plain; charset=utf-8')
                
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(b'<h1>404 - File not found</h1><p>The requested file could not be found.</p>')
                
        except Exception as e:
            print(f'❌ File serving error: {e}')
            self.send_response(500)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(f'<h1>500 - Server Error</h1><p>{str(e)}</p>'.encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        """Override to customize logging"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] {format % args}")

def create_sample_data():
    """Create sample CSV data for testing"""
    if not os.path.exists('data'):
        os.makedirs('data')
    
    sample_file = os.path.join('data', 'survey_data.csv')
    
    if not os.path.exists(sample_file):
        sample_data = [
            {
                'opinion': 'Social media platforms should be held responsible for misinformation spread on their platforms.',
                'set_a_arg1': 'Private companies shouldn\'t be forced to police speech as it violates free market principles.',
                'set_a_arg2': 'Content moderation at scale is technically impossible and will inevitably lead to censorship of legitimate content.',
                'set_a_arg3': 'Government regulation of speech on private platforms sets a dangerous precedent for authoritarianism.',
                'set_b_arg1': 'Users should have personal responsibility to fact-check information rather than relying on platforms.',
                'set_b_arg2': 'Platform liability would destroy small social media companies that can\'t afford extensive moderation.',
                'set_b_arg3': 'Misinformation definitions are subjective and politically biased.'
            },
            {
                'opinion': 'Universal basic income would be an effective solution to poverty and unemployment.',
                'set_a_arg1': 'UBI would reduce work incentives and create a culture of dependency.',
                'set_a_arg2': 'The cost would be astronomical and require massive tax increases that hurt the economy.',
                'set_a_arg3': 'Targeted welfare programs are more efficient than giving money to everyone including the wealthy.',
                'set_b_arg1': 'Inflation would immediately eat up any benefits as prices adjust to increased purchasing power.',
                'set_b_arg2': 'UBI would eliminate the motivation for education and skill development.',
                'set_b_arg3': 'Current welfare systems already provide adequate safety nets without UBI\'s drawbacks.'
            },
            {
                'opinion': 'Climate change requires immediate and drastic action even if it hurts economic growth.',
                'set_a_arg1': 'Economic prosperity is necessary to fund green technology development and environmental protection.',
                'set_a_arg2': 'Rapid economic disruption would harm the poor more than gradual climate change.',
                'set_a_arg3': 'Historical precedent shows markets adapt to environmental challenges better than government intervention.',
                'set_b_arg1': 'Climate models have been consistently wrong and overstate the urgency of the problem.',
                'set_b_arg2': 'Developing countries shouldn\'t be prevented from industrializing like wealthy nations did.',
                'set_b_arg3': 'Technological innovation will solve climate issues without requiring economic sacrifice.'
            }
        ]
        
        with open(sample_file, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=sample_data[0].keys())
            writer.writeheader()
            writer.writerows(sample_data)
        
        print(f'✓ Created sample data file: {sample_file}')
        print(f'  Contains {len(sample_data)} opinion-argument sets')

if __name__ == '__main__':
    # Create sample data if it doesn't exist
    create_sample_data()
    
    # Create responses directory
    if not os.path.exists('responses'):
        os.makedirs('responses')
        print('✓ Created responses directory')
    
    # Start server
    server = HTTPServer(('localhost', 8000), ArgumentSurveyHandler)
    print('=' * 60)
    print('🚀 Argument Evaluation Survey Server Starting')
    print('=' * 60)
    print(f'📍 Server URL: http://localhost:8000')
    print(f'📁 Data folder: ./data/')
    print(f'💾 Responses saved to: ./responses/')
    print(f'📊 CSV summary: ./responses/all_responses.csv')
    print('=' * 60)
    print('📝 Instructions:')
    print('   1. Place your CSV data in the ./data/ folder as "survey_data.csv"')
    print('   2. CSV should have columns: opinion, set_a_arg1, set_a_arg2, set_a_arg3, set_b_arg1, set_b_arg2, set_b_arg3')
    print('   3. Open http://localhost:8000 in your browser')
    print('   4. Press Ctrl+C to stop the server')
    print('=' * 60)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n🛑 Server stopped by user')
        server.server_close()