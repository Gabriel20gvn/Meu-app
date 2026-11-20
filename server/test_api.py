import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from fastapi.testclient import TestClient
from server.api import create_app
from server.jobs import Jobs, BusyError

TOKEN='test-only-access-key-32-characters'


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.jobs=Jobs(self.temp.name,start=False)
        self.client=TestClient(create_app(self.temp.name,TOKEN,manager=self.jobs))
        self.client.__enter__()
        self.auth={'Authorization':'Bearer '+TOKEN}
    def tearDown(self):
        self.client.__exit__(None,None,None)
        self.temp.cleanup()

    def test_auth_validation_and_queue_limit(self):
        self.assertEqual(self.client.get('/api/health').status_code,200)
        self.assertEqual(self.client.post('/api/jobs',json={'video_id':'dQw4w9WgXcQ'}).status_code,401)
        for body in [{'video_id':'https://evil.example/'},{'video_id':'dQw4w9WgXcQ','bpm':0},{'video_id':'dQw4w9WgXcQ','source':'http://127.0.0.1'}]:
            self.assertEqual(self.client.post('/api/jobs',headers=self.auth,json=body).status_code,422)
        ids=[]
        for _ in range(3):
            response=self.client.post('/api/jobs',headers=self.auth,json={'video_id':'dQw4w9WgXcQ','bpm':101})
            self.assertEqual(response.status_code,202);ids.append(response.json()['id'])
        self.assertEqual(self.client.post('/api/jobs',headers=self.auth,json={'video_id':'dQw4w9WgXcQ'}).status_code,429)
        self.assertEqual(self.client.delete('/api/jobs/'+ids[0],headers=self.auth).json()['state'],'cancelled')
        self.assertFalse((self.jobs.folder(ids[0])/'request.json').exists())
        self.assertEqual(self.client.get('/api/jobs/'+ids[1]+'/result',headers=self.auth).status_code,409)
        self.assertEqual(self.client.get('/api/jobs/not-a-job',headers=self.auth).status_code,404)

    def test_upload_bounds_and_cors(self):
        for name in ['music.txt','music.mid']:
            self.assertEqual(self.client.post('/api/jobs/upload',headers=self.auth,data={'video_id':'dQw4w9WgXcQ'},files={'audio':(name,b'bytes')}).status_code,422)
        response=self.client.post('/api/jobs/upload',headers=self.auth,data={'video_id':'dQw4w9WgXcQ','bpm':'101'},files={'audio':('song.wav',b'RIFF test')})
        self.assertEqual(response.status_code,202)
        self.assertTrue((self.jobs.folder(response.json()['id'])/'input.audio').exists())
        self.assertEqual(self.client.post('/api/jobs',headers={**self.auth,'Content-Length':str(82*1024*1024)},content=b'').status_code,413)
        response=self.client.options('/api/jobs',headers={'Origin':'https://gabriel20gvn.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'})
        self.assertEqual(response.headers.get('access-control-allow-origin'),'https://gabriel20gvn.github.io')

    def test_restart_fails_interrupted_jobs_and_removes_audio(self):
        job=self.jobs.create({'source':'youtube','video_id':'dQw4w9WgXcQ','bpm':None})
        folder=self.jobs.folder(job['id']);(folder/'audio.wav').write_bytes(b'private')
        restarted=Jobs(self.temp.name,start=False)
        self.assertEqual(restarted.get(job['id'])['code'],'interrupted')
        self.assertFalse((folder/'audio.wav').exists())
        restarted.close()


class WorkerQueueTests(unittest.TestCase):
    def wait_for(self,manager,id,state):
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if manager.get(id)['state']==state:return
            time.sleep(.02)
        self.fail(str(manager.get(id)))

    def test_completion_cleanup_and_cancellation(self):
        with tempfile.TemporaryDirectory() as folder:
            script="from pathlib import Path; import sys,time; p=Path(sys.argv[1]); (p/'audio.wav').write_bytes(b'private'); time.sleep(.1); (p/'result.mid').write_bytes(b'MThd'); (p/'summary.json').write_text('{}')"
            jobs=Jobs(folder,command=lambda job,p:[sys.executable,'-c',script,str(p)])
            id=jobs.create({'source':'upload'})['id'];self.wait_for(jobs,id,'completed')
            jobs.close()
            self.assertTrue((jobs.folder(id)/'result.mid').exists())
            self.assertFalse((jobs.folder(id)/'audio.wav').exists())
        with tempfile.TemporaryDirectory() as folder:
            jobs=Jobs(folder,command=lambda job,p:[sys.executable,'-c','import time; time.sleep(30)'])
            id=jobs.create({'source':'upload'})['id'];self.wait_for(jobs,id,'preparing')
            jobs.cancel(id);self.wait_for(jobs,id,'cancelled');jobs.close()
            self.assertFalse((jobs.folder(id)/'request.json').exists())

    def test_timeout_has_actionable_error(self):
        with tempfile.TemporaryDirectory() as folder:
            jobs=Jobs(folder,timeout=.1,command=lambda job,p:[sys.executable,'-c','import time; time.sleep(30)'])
            id=jobs.create({'source':'upload'})['id'];self.wait_for(jobs,id,'failed')
            self.assertEqual(jobs.get(id)['code'],'timeout');jobs.close()


if __name__=='__main__':unittest.main()
